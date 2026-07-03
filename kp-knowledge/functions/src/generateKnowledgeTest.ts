// AI test generation for KP Knowledge — an admin uploads a Word doc (the
// content source) plus optional "exhibit" files (e.g. a blank W-4 rendered
// to page images client-side). Claude turns the doc into training slides +
// a quiz, choosing which exhibit page to screenshot onto each slide. We
// store the page images in Firebase Storage and save the result as a DRAFT
// test (isActive: false) for the admin to review, edit, and publish.
//
// Auth: Firebase ID token + admin-tier role check (Cloud Functions run with
// Admin SDK privileges, so this check is the enforcement layer).

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import Anthropic from "@anthropic-ai/sdk";
import * as mammoth from "mammoth";
import sharp from "sharp";
import { ALLOWED_ORIGINS, uploadJpeg, verifyManager } from "./shared";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// Opus — content generation quality matters here (training material +
// fair, well-constructed quiz questions), and volume is a few runs a week.
const GENERATION_MODEL = "claude-opus-4-8";

const MAX_EXHIBITS = 5;
const MAX_EXHIBIT_PAGES = 20; // across all exhibits

// Exhibits arrive pre-rendered from the client: each page as a base64 JPEG
// (the browser rasterizes PDFs with pdf.js; plain images come as one page).
interface ExhibitPageIn {
  pageNumber: number;
  imageBase64: string; // JPEG, no data: prefix
}
interface ExhibitIn {
  name: string;
  pages: ExhibitPageIn[];
}

// Structured output schema — Claude must return exactly this shape.
const TEST_SCHEMA = {
  type: "object" as const,
  properties: {
    name: { type: "string", description: "Short test title, e.g. 'W-4 Completion Certification'" },
    description: { type: "string", description: "One-sentence summary of what the test covers" },
    maxWrongToPass: {
      type: "integer",
      description: "How many wrong answers still pass — roughly 20% of the question count, rounded down",
    },
    slides: {
      type: "array",
      description: "Training slides in KP Training Template layouts, in teaching order",
      items: {
        type: "object" as const,
        properties: {
          kind: {
            type: "string",
            enum: ["title", "section", "agenda", "bullets", "steps", "image", "imageWide"],
            description: "Which template layout this slide uses",
          },
          kicker: {
            type: ["string", "null"],
            description: "Small uppercase label above the title (e.g. 'GETTING STARTED'); null on none",
          },
          title: { type: "string", description: "Slide heading" },
          subtitle: {
            type: ["string", "null"],
            description: "Supporting sentence — title/section slides only, null otherwise",
          },
          items: {
            type: ["array", "null"],
            items: { type: "string" },
            description: "Agenda rows (3-6) — agenda slides only, null otherwise",
          },
          columns: {
            type: ["array", "null"],
            description: "1-2 columns of headed bullet lists — bullets slides only, null otherwise",
            items: {
              type: "object" as const,
              properties: {
                heading: { type: "string", description: "Column card heading" },
                bullets: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "3-6 concise bullets; use 'Lead — description' to bold a lead-in term",
                },
              },
              required: ["heading", "bullets"],
              additionalProperties: false,
            },
          },
          steps: {
            type: ["array", "null"],
            description: "2-4 sequential process steps — steps slides only, null otherwise",
            items: {
              type: "object" as const,
              properties: {
                title: { type: "string" },
                description: { type: "string", description: "One or two short sentences" },
              },
              required: ["title", "description"],
              additionalProperties: false,
            },
          },
          body: {
            type: ["string", "null"],
            description: "Short paragraph next to the screenshot — image slides only, null otherwise",
          },
          note: {
            type: ["string", "null"],
            description: "Optional callout note under the body — image slides only",
          },
          image: {
            type: ["object", "null"],
            description:
              "Exhibit page displayed on this slide (1-based numbers matching the exhibits provided) — image slides only, null otherwise",
            properties: {
              exhibit: { type: "integer", description: "1-based exhibit number" },
              page: { type: "integer", description: "1-based page within that exhibit" },
              region: {
                type: ["object", "null"],
                description:
                  "Crop showing just the part of the page this slide discusses, in PIXEL coordinates of that page image (dimensions were given per page). null = show the whole page.",
                properties: {
                  x: { type: "integer", description: "Left edge, px" },
                  y: { type: "integer", description: "Top edge, px" },
                  width: { type: "integer", description: "Crop width, px" },
                  height: { type: "integer", description: "Crop height, px" },
                },
                required: ["x", "y", "width", "height"],
                additionalProperties: false,
              },
            },
            required: ["exhibit", "page", "region"],
            additionalProperties: false,
          },
        },
        required: [
          "kind", "kicker", "title", "subtitle", "items", "columns", "steps", "body", "note", "image",
        ],
        additionalProperties: false,
      },
    },
    questions: {
      type: "array",
      description: "Quiz questions testing the slide content",
      items: {
        type: "object" as const,
        properties: {
          text: { type: "string" },
          type: { type: "string", enum: ["MC", "TF"] },
          optionA: { type: "string" },
          optionB: { type: "string" },
          optionC: { type: ["string", "null"], description: "null for TF questions" },
          optionD: { type: ["string", "null"], description: "null for TF questions" },
          correctAnswer: { type: "string", enum: ["A", "B", "C", "D"] },
        },
        required: ["text", "type", "optionA", "optionB", "optionC", "optionD", "correctAnswer"],
        additionalProperties: false,
      },
    },
  },
  required: ["name", "description", "maxWrongToPass", "slides", "questions"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You create internal training material for KP Staffing, a light-industrial staffing company. Given a source document (and possibly exhibit files such as blank forms), you produce a slide deck in the KP Training Template layouts, plus a quiz.

THE SLIDE DECK teaches the document's content to staff. Cover ALL substantive content — policies, procedures, rules, numbers, deadlines — in teaching order, in plain language a busy employee can absorb. Typically 8-18 slides depending on the document's length.

CHOOSING LAYOUTS: you decide the layout for every slide, and the decision should be driven by the shape of that slide's content — never by habit. Before writing each slide, ask: is this a sequence (steps)? a comparison or pairing (two-column bullets)? a list of topics (agenda)? a form or visual to look at (image)? a topic change (section)? Only content that is genuinely "several parallel facts about one topic" belongs on a single-column bullets slide. A deck where most content slides are single-column bullet lists is a failure of layout choice — real documents contain processes, pairings, and visuals, and the deck should reflect that. Six layouts are available:

- "title": the cover. Exactly ONE, always the FIRST slide. kicker = the training series or topic in a few words (e.g. "NEW HIRE TRAINING"); title = the deck's name; subtitle = one welcoming sentence about what the training covers.
- "agenda": the second slide. items = 3-6 rows summarizing what the training covers, in order. kicker "AGENDA", title like "What to Expect".
- "section": a divider that opens each major section of a longer deck. kicker = "SECTION ONE", "SECTION TWO", ... in sequence; title = the section name; subtitle = one sentence on what the section covers. Use sections only when the material has 2+ genuinely distinct parts; skip them for short single-topic decks.
- "bullets": the workhorse content slide. columns = 1 column normally; 2 columns when the content pairs naturally (do/don't, what you'll do/who to ask, requirements/exceptions). Each column has a heading and 3-6 bullets. Write bullets as "Lead — description" when there's a natural lead-in term (it renders bold). No column heading repetition of the slide title.
- "steps": a numbered process with 2-4 sequential steps (apply → orientation → assignment → check-in). Each step: short title + one-two sentence description. Use for any procedure with a clear order.
- "image": a screenshot slide — the exhibit image fills the left half; kicker/title on the right with a short body paragraph explaining what the viewer is looking at, and optionally a note (a short callout, e.g. a common mistake or where to sign). Use when the image is roughly page-shaped (taller than wide, or square).
- "imageWide": the horizontal screenshot slide — the image spans the top ~60% of the slide with the title/body/note in a band below. Use when the image (usually a crop) is WIDE and SHORT — a single form row, a signature line, a table header. A wide crop on a side-by-side "image" slide wastes most of the pane; put it on "imageWide" instead. Only "image" and "imageWide" slides carry an "image" reference.

Layout discipline: every slide sets exactly the fields its kind needs and null for the rest. Don't pad the deck — no "questions?" slide, no closing slide, no bullet that restates the slide title.

EXHIBIT SCREENSHOTS: when exhibits are provided (e.g. a blank W-4 form), use "image" slides to walk through them. Place image slides at the point in the teaching order where the form section comes up. Don't force every page onto a slide, and don't repeat the same view on many slides.

CROPPING — show the PART of the page the slide is about: each page image's pixel dimensions are given with it. When a slide discusses one section of a page (one step of a form, one signature block, one table), set image.region to the pixel rectangle containing just that section, with a comfortable margin (~20-30px) around it so nothing is clipped mid-line; the region should span the page's full printed width unless the relevant content is clearly narrower. Use region: null only when the slide is genuinely about the whole page (an overview or orientation slide). A crop that shows exactly what the bullets describe teaches far better than a full page where the viewer must hunt for the relevant part.

THE QUIZ: 10-15 questions (fewer only if the document is genuinely thin) testing understanding of the slide content. Mix multiple-choice (MC, 3-4 options) and true/false (TF). Every answer must be verifiable from the slides. Wrong options should be plausible — the kinds of mistakes someone who skimmed would make — never joke answers. TF questions use optionA "True" and optionB "False" with optionC/optionD null. Spread questions across the whole document, not just the start.

maxWrongToPass: about 20% of the question count, rounded down (e.g. 12 questions → 2).

Base everything strictly on the provided material. Do not invent policies, numbers, or rules that aren't in it. If the document references a person by name for a process step, keep the role, not the personal name (say "your admin" or the role title).`;

type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: "image/jpeg"; data: string };
    };

export const generateKnowledgeTest = onRequest(
  {
    cors: ALLOWED_ORIGINS,
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 540,
    memory: "1GiB",
    region: "us-central1",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "POST only" });
      return;
    }

    const auth = await verifyManager(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error });
      return;
    }

    const { filename, data, exhibits } = req.body ?? {};
    if (typeof data !== "string" || !data) {
      res.status(400).json({ ok: false, error: "Missing base64 'data' field" });
      return;
    }
    if (typeof filename !== "string" || !filename.toLowerCase().endsWith(".docx")) {
      res.status(400).json({ ok: false, error: "The source document must be a .docx file" });
      return;
    }

    // Validate exhibits
    const exhibitList: ExhibitIn[] = Array.isArray(exhibits) ? exhibits : [];
    if (exhibitList.length > MAX_EXHIBITS) {
      res.status(400).json({ ok: false, error: `Too many exhibits (max ${MAX_EXHIBITS})` });
      return;
    }
    const totalPages = exhibitList.reduce((n, e) => n + (e.pages?.length ?? 0), 0);
    if (totalPages > MAX_EXHIBIT_PAGES) {
      res.status(400).json({ ok: false, error: `Too many exhibit pages (max ${MAX_EXHIBIT_PAGES} total)` });
      return;
    }
    for (const e of exhibitList) {
      if (typeof e?.name !== "string" || !Array.isArray(e?.pages) || e.pages.length === 0) {
        res.status(400).json({ ok: false, error: "Malformed exhibit payload" });
        return;
      }
    }

    // Extract text from the Word doc
    let text: string;
    try {
      const buffer = Buffer.from(data, "base64");
      if (buffer.length > 15 * 1024 * 1024) {
        res.status(400).json({ ok: false, error: "Source document too large (15MB max)" });
        return;
      }
      const result = await mammoth.extractRawText({ buffer });
      text = result.value.trim();
    } catch (e) {
      res.status(400).json({ ok: false, error: `Couldn't read the Word document: ${(e as Error).message}` });
      return;
    }
    if (text.length < 200) {
      res.status(400).json({ ok: false, error: "Document has too little text to build a test from" });
      return;
    }
    // Guard the context window — plenty for any realistic training doc
    if (text.length > 400_000) text = text.slice(0, 400_000);

    // Upload exhibit page images to Storage up front so slide images have
    // stable URLs regardless of what the model picks. Token-style download
    // URLs (unguessable UUID) — same mechanism the Firebase client SDK uses.
    const db = admin.firestore();
    const testRef = db.collection("knowledgeTests").doc();
    const assets: Array<{ name: string; page: number; url: string }> = [];

    // pages[exhibitIdx][pageIdx] -> {url, buffer, width, height}
    const pages: Array<Array<{ url: string; buffer: Buffer; width: number; height: number }>> = [];
    try {
      for (let ei = 0; ei < exhibitList.length; ei++) {
        pages.push([]);
        for (let pi = 0; pi < exhibitList[ei].pages.length; pi++) {
          const page = exhibitList[ei].pages[pi];
          const buffer = Buffer.from(page.imageBase64, "base64");
          const meta = await sharp(buffer).metadata();
          const url = await uploadJpeg(
            `knowledgeAssets/${testRef.id}/exhibit-${ei + 1}-page-${page.pageNumber}.jpg`,
            buffer
          );
          pages[ei].push({ url, buffer, width: meta.width ?? 0, height: meta.height ?? 0 });
          assets.push({ name: exhibitList[ei].name, page: page.pageNumber, url });
        }
      }
    } catch (e) {
      console.error("exhibit upload failed", e);
      res.status(502).json({ ok: false, error: `Couldn't store exhibit images: ${(e as Error).message}` });
      return;
    }

    // Build the multimodal user message: document text + labeled exhibit pages
    const content: ContentBlock[] = [
      {
        type: "text",
        text: `Source document ("${filename}"):\n\n<document>\n${text}\n</document>`,
      },
    ];
    exhibitList.forEach((exhibit, ei) => {
      content.push({
        type: "text",
        text: `Exhibit ${ei + 1}: "${exhibit.name}" (${exhibit.pages.length} page${exhibit.pages.length === 1 ? "" : "s"}). The pages follow in order.`,
      });
      exhibit.pages.forEach((page, pi) => {
        const dims = pages[ei][pi];
        content.push({
          type: "text",
          text: `Exhibit ${ei + 1}, page ${pi + 1} (${dims.width}×${dims.height} px):`,
        });
        content.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: page.imageBase64 },
        });
      });
    });
    content.push({
      type: "text",
      text: exhibitList.length
        ? "Create the training slides and quiz. Use exhibit screenshots on the slides where they help (via the image field, using the exhibit/page numbers above)."
        : "Create the training slides and quiz.",
    });

    // Generate slides + quiz with Claude
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    interface GeneratedSlide {
      kind: "title" | "section" | "agenda" | "bullets" | "steps" | "image" | "imageWide";
      kicker: string | null;
      title: string;
      subtitle: string | null;
      items: string[] | null;
      columns: Array<{ heading: string; bullets: string[] }> | null;
      steps: Array<{ title: string; description: string }> | null;
      body: string | null;
      note: string | null;
      image: {
        exhibit: number;
        page: number;
        region: { x: number; y: number; width: number; height: number } | null;
      } | null;
    }
    let generated: {
      name: string;
      description: string;
      maxWrongToPass: number;
      slides: GeneratedSlide[];
      questions: Array<{
        text: string;
        type: "MC" | "TF";
        optionA: string;
        optionB: string;
        optionC: string | null;
        optionD: string | null;
        correctAnswer: "A" | "B" | "C" | "D";
      }>;
    };
    try {
      const stream = anthropic.messages.stream({
        model: GENERATION_MODEL,
        max_tokens: 32000,
        thinking: { type: "adaptive" },
        system: SYSTEM_PROMPT,
        output_config: { format: { type: "json_schema", schema: TEST_SCHEMA } },
        messages: [{ role: "user", content }],
      });
      const message = await stream.finalMessage();
      if (message.stop_reason === "refusal") {
        res.status(422).json({ ok: false, error: "The model declined to process this document" });
        return;
      }
      const jsonText = message.content.find((b) => b.type === "text");
      if (!jsonText || jsonText.type !== "text") throw new Error("No text block in response");
      generated = JSON.parse(jsonText.text);
    } catch (e) {
      console.error("generation failed", e);
      res.status(502).json({ ok: false, error: `Generation failed: ${(e as Error).message}` });
      return;
    }

    if (!generated.slides?.length || !generated.questions?.length) {
      res.status(502).json({ ok: false, error: "Model returned an empty test" });
      return;
    }

    // Resolve slide image references to stored URLs. When the model chose a
    // crop region, cut it out of the page (clamped to bounds) and store the
    // detail as its own asset — the slide shows exactly the relevant part.
    let cropCount = 0;
    const slides = [];
    for (const s of generated.slides) {
      let imageUrl: string | null = null;
      let imageLabel: string | null = null;
      const pageInfo = s.image ? pages[s.image.exhibit - 1]?.[s.image.page - 1] : undefined;
      if (s.image && pageInfo) {
        const ex = exhibitList[s.image.exhibit - 1];
        imageUrl = pageInfo.url;
        imageLabel = `${ex.name} — page ${s.image.page}`;
        const r = s.image.region;
        if (r && pageInfo.width > 0 && pageInfo.height > 0) {
          // Clamp to page bounds; ignore degenerate or near-full-page crops
          const x = Math.max(0, Math.min(r.x, pageInfo.width - 1));
          const y = Math.max(0, Math.min(r.y, pageInfo.height - 1));
          const w = Math.max(1, Math.min(r.width, pageInfo.width - x));
          const h = Math.max(1, Math.min(r.height, pageInfo.height - y));
          const nearFull = w * h > 0.9 * pageInfo.width * pageInfo.height;
          if (!nearFull && w >= 60 && h >= 40) {
            try {
              cropCount += 1;
              const cropBuffer = await sharp(pageInfo.buffer)
                .extract({ left: x, top: y, width: w, height: h })
                .jpeg({ quality: 88 })
                .toBuffer();
              const cropUrl = await uploadJpeg(
                `knowledgeAssets/${testRef.id}/crop-${cropCount}-ex${s.image.exhibit}-p${s.image.page}.jpg`,
                cropBuffer
              );
              imageUrl = cropUrl;
              imageLabel = `${ex.name} — page ${s.image.page} (detail)`;
              assets.push({ name: `${ex.name} (detail ${cropCount})`, page: s.image.page, url: cropUrl });
            } catch (e) {
              // Fall back to the full page rather than failing the run
              console.error("crop failed, using full page", e);
            }
          }
        }
      }
      slides.push({
        kind: s.kind === "imageWide" ? "image" : s.kind,
        imagePosition: s.kind === "imageWide" ? "top" : "left",
        kicker: s.kicker ?? null,
        title: s.title,
        subtitle: s.subtitle ?? null,
        items: s.items ?? null,
        columns: s.columns ?? null,
        steps: s.steps ?? null,
        body: s.body ?? null,
        note: s.note ?? null,
        imageUrl,
        imageLabel,
      });
    }

    // Save as a DRAFT test (invisible to employees until published)
    const batch = db.batch();
    batch.set(testRef, {
      name: generated.name,
      description: generated.description,
      maxWrongToPass: generated.maxWrongToPass,
      isActive: false,
      status: "draft",
      aiGenerated: true,
      sourceDocName: filename,
      tags: [],
      slides,
      assets,
      questionCount: generated.questions.length,
      createdBy: auth.email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    generated.questions.forEach((q, i) => {
      batch.set(testRef.collection("questions").doc(), {
        text: q.text,
        type: q.type,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC ?? null,
        optionD: q.optionD ?? null,
        correctAnswer: q.correctAnswer,
        orderNum: i + 1,
      });
    });
    await batch.commit();

    res.json({
      ok: true,
      testId: testRef.id,
      name: generated.name,
      slideCount: slides.length,
      questionCount: generated.questions.length,
    });
  }
);
