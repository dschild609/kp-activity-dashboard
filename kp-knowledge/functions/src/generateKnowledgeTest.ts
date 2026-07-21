// AI test generation for KP Knowledge — an admin uploads a Word doc (the
// content source) plus optional "exhibit" files (e.g. a blank W-4 rendered
// to page images client-side). Claude turns the doc into training slides +
// a quiz, choosing which exhibit page (and which region of it) each
// screenshot slide shows. We store the images in Firebase Storage and save
// the result as a DRAFT test (isActive: false) for review and publishing.

import * as admin from "firebase-admin";
import * as mammoth from "mammoth";
import sharp from "sharp";
import {
  ANTHROPIC_API_KEY,
  COLUMNS_ITEMS_SCHEMA,
  ClaudeRefusalError,
  MAX_PAGES,
  QUESTION_PROPS,
  STEPS_ITEMS_SCHEMA,
  claudeJson,
  managerEndpoint,
  uploadJpeg,
  type GeneratedQuestion,
} from "./shared";

const MAX_EXHIBITS = 5;

// The synthetic exhibit that carries screenshots pulled out of the .docx
// itself (as opposed to separately-uploaded exhibit files).
const EMBEDDED_EXHIBIT_NAME = "Screenshots from the document";
const EMBEDDED_MIN_AREA = 40_000; // px² — drops inline icons, bullets, rules
const EMBEDDED_MAX_DIM = 2048; // cap the long edge (token + storage control)
const EMBEDDED_MAX_IMAGES = 12; // cap screenshots pulled from one document

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

// Word HTML → readable plain text, preserving the structure the raw-text
// extractor throws away (headings/paragraphs as lines, list items as bullets,
// table cells spaced) so the model reads a cleaner document.
function wordHtmlToText(html: string): string {
  return html
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|h[1-6]|div|tr|li)>/gi, "\n")
    .replace(/<\/(td|th)>/gi, "   ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&rdquo;|&ldquo;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface DocExtract {
  text: string; // with inline [SCREENSHOT N] markers at each kept image's spot
  screenshots: string[]; // base64 JPEGs, in document order (page N = index N-1)
  dropped: number; // kept-eligible screenshots left out by the per-doc cap
}

/* Pull embedded screenshots out of a .docx in reading order, weaving a
 * [SCREENSHOT N] marker into the text at each one's position so the model
 * knows which step every screenshot illustrates. Decorative images (tiny
 * icons, repeated logos deduped to one) are filtered out; the survivors are
 * normalized to bounded JPEGs matching the exhibit-page contract. */
async function extractDocWithScreenshots(buffer: Buffer): Promise<DocExtract> {
  const captured: string[] = []; // base64 source bytes, deduped, in order
  const seen = new Map<string, number>();

  const { value: html } = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (el) => {
        const b64 = await el.read("base64");
        let idx = seen.get(b64);
        if (idx === undefined) {
          idx = captured.length;
          captured.push(b64);
          seen.set(b64, idx);
        }
        return { src: `docimg://${idx}` };
      }),
    }
  );

  // Normalize each captured image; keep real screenshots, assign them
  // sequential 1-based page numbers, and remember which were dropped.
  const keptPage = new Map<number, number>();
  const screenshots: string[] = [];
  let dropped = 0;
  for (let i = 0; i < captured.length; i++) {
    try {
      const src = Buffer.from(captured[i], "base64");
      const meta = await sharp(src).metadata();
      if ((meta.width ?? 0) * (meta.height ?? 0) < EMBEDDED_MIN_AREA) continue; // decorative
      if (screenshots.length >= EMBEDDED_MAX_IMAGES) {
        dropped++;
        continue;
      }
      const jpeg = await sharp(src)
        .flatten({ background: "#ffffff" }) // screenshots are opaque; be safe on PNGs
        .resize({ width: EMBEDDED_MAX_DIM, height: EMBEDDED_MAX_DIM, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
      keptPage.set(i, screenshots.length + 1);
      screenshots.push(jpeg.toString("base64"));
    } catch {
      // Unreadable (EMF/WMF vector, corrupt) — skip, no marker
    }
  }

  // Swap each image placeholder for its marker (or remove it if dropped).
  const marked = html.replace(/<img[^>]*src="docimg:\/\/(\d+)"[^>]*\/?>/g, (_m, n) => {
    const page = keptPage.get(Number(n));
    return page ? `\n[SCREENSHOT ${page}]\n` : "";
  });
  return { text: wordHtmlToText(marked), screenshots, dropped };
}

// Structured output schema — Claude must return exactly this shape.
export const TEST_SCHEMA = {
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
            enum: ["title", "section", "agenda", "bullets", "steps", "image", "hotspot"],
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
            items: COLUMNS_ITEMS_SCHEMA,
          },
          steps: {
            type: ["array", "null"],
            description: "2-4 sequential process steps — steps slides only, null otherwise",
            items: STEPS_ITEMS_SCHEMA,
          },
          body: {
            type: ["string", "null"],
            description: "Short paragraph next to the screenshot — image slides only, null otherwise",
          },
          note: {
            type: ["string", "null"],
            description: "Optional callout note under the body — image slides only",
          },
          imagePosition: {
            // enum alone (no `type`) — Anthropic's structured-output validator
            // rejects a type-array combined with enum (400: "Enum value 'left'
            // does not match declared type ['string','null']").
            enum: ["left", "top", null],
            description:
              "Image slides only: 'left' = image fills the left half (page-shaped images); 'top' = image spans the top with text below (wide, short crops like a form row). null on non-image slides.",
          },
          image: {
            type: ["object", "null"],
            description:
              "Exhibit page displayed on this slide (1-based numbers matching the exhibits provided) — image and hotspot slides only, null otherwise",
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
          hotspotPrompt: {
            type: ["string", "null"],
            description:
              "Hotspot slides only: the short imperative find-it instruction shown to the trainee (e.g. 'Click where the employee signs the form') — null otherwise",
          },
          hotspot: {
            type: ["object", "null"],
            description:
              "Hotspot slides only: the target the trainee must click, in PIXEL coordinates of the referenced page image (same pixel space as image.region) — a tight box around the element plus ~10-20px margin. null otherwise",
            properties: {
              x: { type: "integer", description: "Left edge, px" },
              y: { type: "integer", description: "Top edge, px" },
              width: { type: "integer", description: "Target width, px" },
              height: { type: "integer", description: "Target height, px" },
            },
            required: ["x", "y", "width", "height"],
            additionalProperties: false,
          },
        },
        required: [
          "kind", "kicker", "title", "subtitle", "items", "columns", "steps",
          "body", "note", "imagePosition", "image", "hotspotPrompt", "hotspot",
        ],
        additionalProperties: false,
      },
    },
    questions: {
      type: "array",
      description: "Quiz questions testing the slide content",
      items: {
        type: "object" as const,
        properties: QUESTION_PROPS,
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

CHOOSING LAYOUTS: you decide the layout for every slide, and the decision should be driven by the shape of that slide's content — never by habit. Before writing each slide, ask: is this a sequence (steps)? a comparison or pairing (two-column bullets)? a list of topics (agenda)? a form or visual to look at (image)? a topic change (section)? Only content that is genuinely "several parallel facts about one topic" belongs on a single-column bullets slide. A deck where most content slides are single-column bullet lists is a failure of layout choice — real documents contain processes, pairings, and visuals, and the deck should reflect that. Seven layouts are available:

- "title": the cover. Exactly ONE, always the FIRST slide. kicker = the training series or topic in a few words (e.g. "NEW HIRE TRAINING"); title = the deck's name; subtitle = one welcoming sentence about what the training covers.
- "agenda": the second slide. items = 3-6 rows summarizing what the training covers, in order. kicker "AGENDA", title like "What to Expect".
- "section": a divider that opens each major section of a longer deck. kicker = "SECTION ONE", "SECTION TWO", ... in sequence; title = the section name; subtitle = one sentence on what the section covers. Use sections only when the material has 2+ genuinely distinct parts; skip them for short single-topic decks.
- "bullets": the workhorse content slide. columns = 1 column normally; 2 columns when the content pairs naturally (do/don't, what you'll do/who to ask, requirements/exceptions). Each column has a heading and 3-6 bullets. Write bullets as "Lead — description" when there's a natural lead-in term (it renders bold). No column heading repetition of the slide title.
- "steps": a numbered process with 2-4 sequential steps (apply → orientation → assignment → check-in). Each step: short title + one-two sentence description. Use for any procedure with a clear order.
- "image": a screenshot slide. Set imagePosition per the image's shape: "left" (side-by-side — the image fills the left half, kicker/title/body on the right) when the image is roughly page-shaped (taller than wide, or square); "top" (horizontal — the image spans the top ~60% with the text in a band below) when the image is WIDE and SHORT — a single form row, a signature line, a table header. A wide crop on a side-by-side slide wastes most of the pane. Include a short body paragraph explaining what the viewer is looking at, and optionally a note (a short callout, e.g. a common mistake or where to sign). Only image and hotspot slides carry an "image" reference; only image slides use imagePosition.
- "hotspot": an INTERACTIVE find-it exercise — the trainee sees the screenshot with your hotspotPrompt instruction and must CLICK the right spot before the deck lets them continue. Use it when an exhibit clearly shows a specific findable element that the document tells people to locate, sign, check, or fill (a signature line, a date box, a checkbox, a field). Set hotspotPrompt to a short imperative instruction ("Click where the employee signs and dates the form"); set hotspot to the PIXEL rectangle of that element on the page (tight box plus ~10-20px margin — the same pixel space as image.region); set note to a one-sentence explanation shown after they find it (why the spot matters or a common mistake). A region crop is allowed but must fully CONTAIN the hotspot — when in doubt use region: null so there's a whole page to hunt through. Use 1-3 hotspot slides per deck at most, only where a precise target genuinely exists, and NEVER invent a target you cannot see in the exhibit image.

Layout discipline: every slide sets exactly the fields its kind needs and null for the rest. Don't pad the deck — no "questions?" slide, no closing slide, no bullet that restates the slide title.

EXHIBIT SCREENSHOTS: when exhibits are provided (e.g. a blank W-4 form), use "image" slides to walk through them. Place image slides at the point in the teaching order where the form section comes up. Don't force every page onto a slide, and don't repeat the same view on many slides. When the document teaches WHERE on a form to do something, prefer one "hotspot" slide (an active exercise) over repeating the same view as another static image slide.

EMBEDDED SCREENSHOTS: if the source document itself contained screenshots, they are supplied as the exhibit named "${EMBEDDED_EXHIBIT_NAME}", and the document text carries [SCREENSHOT N] markers showing exactly where each one appeared — screenshot N is page N of that exhibit. These are real, in-context screenshots of the actual system the document is teaching, so they are your BEST material: for each meaningful marker, build an image slide (or a hotspot slide, if that step is about clicking/finding a specific spot) at that point in the teaching order, setting image.exhibit to that exhibit's number and image.page to N. Follow the author's placement — a screenshot sitting under a step illustrates that step. Skip a marker only when the screenshot is purely decorative (a header banner or logo) or would just repeat the previous slide's view. Never reference a [SCREENSHOT N] whose page you were not given.

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

/* Working rectangle — page pixels or image fractions per context. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface GeneratedSlide {
  kind: "title" | "section" | "agenda" | "bullets" | "steps" | "image" | "hotspot";
  kicker: string | null;
  title: string;
  subtitle: string | null;
  items: string[] | null;
  columns: Array<{ heading: string; bullets: string[] }> | null;
  steps: Array<{ title: string; description: string }> | null;
  body: string | null;
  note: string | null;
  imagePosition: "left" | "top" | null;
  image: {
    exhibit: number;
    page: number;
    region: { x: number; y: number; width: number; height: number } | null;
  } | null;
  hotspotPrompt: string | null;
  hotspot: { x: number; y: number; width: number; height: number } | null;
}

export const generateKnowledgeTest = managerEndpoint(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: "1GiB" },
  async (req, res, auth) => {
    const { filename, data, exhibits, includeScreenshots } = req.body ?? {};
    if (typeof data !== "string" || !data) {
      res.status(400).json({ ok: false, error: "Missing base64 'data' field" });
      return;
    }
    if (typeof filename !== "string" || !filename.toLowerCase().endsWith(".docx")) {
      res.status(400).json({ ok: false, error: "The source document must be a .docx file" });
      return;
    }
    // On by default: pull the document's own screenshots onto slides.
    const wantScreenshots = includeScreenshots !== false;

    // Validate exhibits
    const exhibitList: ExhibitIn[] = Array.isArray(exhibits) ? exhibits : [];
    if (exhibitList.length > MAX_EXHIBITS) {
      res.status(400).json({ ok: false, error: `Too many exhibits (max ${MAX_EXHIBITS})` });
      return;
    }
    const totalPages = exhibitList.reduce((n, e) => n + (e.pages?.length ?? 0), 0);
    if (totalPages > MAX_PAGES) {
      res.status(400).json({ ok: false, error: `Too many exhibit pages (max ${MAX_PAGES} total)` });
      return;
    }
    for (const e of exhibitList) {
      if (typeof e?.name !== "string" || !Array.isArray(e?.pages) || e.pages.length === 0) {
        res.status(400).json({ ok: false, error: "Malformed exhibit payload" });
        return;
      }
    }

    // Extract text from the Word doc — and, by default, the screenshots
    // embedded in it, which become a synthetic exhibit ("Screenshots from the
    // document") so they flow through the same upload/crop/hotspot/slide path
    // as uploaded exhibits. Position markers in the text tell the model which
    // step each one illustrates.
    let text: string;
    let embeddedScreens: string[] = [];
    try {
      const buffer = Buffer.from(data, "base64");
      if (buffer.length > 15 * 1024 * 1024) {
        res.status(400).json({ ok: false, error: "Source document too large (15MB max)" });
        return;
      }
      if (wantScreenshots) {
        const extracted = await extractDocWithScreenshots(buffer);
        text = extracted.text;
        embeddedScreens = extracted.screenshots;
        if (extracted.dropped > 0) {
          console.log(`generateKnowledgeTest: dropped ${extracted.dropped} screenshot(s) over the ${EMBEDDED_MAX_IMAGES}-image cap`);
        }
      } else {
        text = (await mammoth.extractRawText({ buffer })).value.trim();
      }
    } catch (e) {
      res.status(400).json({ ok: false, error: `Couldn't read the Word document: ${(e as Error).message}` });
      return;
    }

    // Prepend the embedded screenshots as exhibit 1, trimmed to the shared
    // page budget (uploaded exhibits keep their room).
    if (embeddedScreens.length > 0) {
      const budget = Math.max(0, MAX_PAGES - exhibitList.reduce((n, e) => n + e.pages.length, 0));
      const pages = embeddedScreens.slice(0, budget);
      if (pages.length > 0) {
        exhibitList.unshift({
          name: EMBEDDED_EXHIBIT_NAME,
          pages: pages.map((imageBase64, i) => ({ pageNumber: i + 1, imageBase64 })),
        });
      }
    }
    if (text.length < 200) {
      res.status(400).json({ ok: false, error: "Document has too little text to build a test from" });
      return;
    }
    // Guard the context window — plenty for any realistic training doc
    if (text.length > 400_000) text = text.slice(0, 400_000);

    // Upload exhibit page images to Storage up front (concurrently) so slide
    // images have stable URLs regardless of what the model picks.
    const db = admin.firestore();
    const testRef = db.collection("knowledgeTests").doc();
    const assets: Array<{ name: string; page: number; url: string }> = [];
    // pages[exhibitIdx][pageIdx] -> {url, buffer, width, height}
    let pages: Array<Array<{ url: string; buffer: Buffer; width: number; height: number }>>;
    try {
      pages = await Promise.all(
        exhibitList.map((exhibit, ei) =>
          Promise.all(
            exhibit.pages.map(async (page) => {
              const buffer = Buffer.from(page.imageBase64, "base64");
              const meta = await sharp(buffer).metadata();
              const url = await uploadJpeg(
                `knowledgeAssets/${testRef.id}/exhibit-${ei + 1}-page-${page.pageNumber}.jpg`,
                buffer
              );
              return { url, buffer, width: meta.width ?? 0, height: meta.height ?? 0 };
            })
          )
        )
      );
      exhibitList.forEach((exhibit, ei) => {
        exhibit.pages.forEach((page, pi) => {
          assets.push({ name: exhibit.name, page: page.pageNumber, url: pages[ei][pi].url });
        });
      });
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
    const hasEmbedded = exhibitList[0]?.name === EMBEDDED_EXHIBIT_NAME;
    content.push({
      type: "text",
      text: hasEmbedded
        ? "Create the training slides and quiz. The document's own screenshots are exhibit 1; put each one on the slide it belongs to, following the [SCREENSHOT N] markers in the text, and make it a hotspot slide where the step is about clicking or finding a spot."
        : exhibitList.length
          ? "Create the training slides and quiz. Use exhibit screenshots on the slides where they help (via the image field, using the exhibit/page numbers above), and add a hotspot slide where the material teaches finding a specific spot on a form."
          : "Create the training slides and quiz.",
    });

    // Generate slides + quiz with Claude
    let generated: {
      name: string;
      description: string;
      maxWrongToPass: number;
      slides: GeneratedSlide[];
      questions: GeneratedQuestion[];
    };
    try {
      generated = await claudeJson({ system: SYSTEM_PROMPT, content, schema: TEST_SCHEMA });
    } catch (e) {
      if (e instanceof ClaudeRefusalError) {
        res.status(422).json({ ok: false, error: "The model declined to process this document" });
        return;
      }
      console.error("generation failed", e);
      res.status(502).json({ ok: false, error: `Generation failed: ${(e as Error).message}` });
      return;
    }

    if (!generated.slides?.length || !generated.questions?.length) {
      res.status(502).json({ ok: false, error: "Model returned an empty test" });
      return;
    }

    // Resolve slide image references to stored URLs. When the model chose a
    // crop region, cut it out of the page (clamped to bounds, concurrently)
    // and store the detail as its own asset.
    const slides = await Promise.all(
      generated.slides.map(async (s, si) => {
        let imageUrl: string | null = null;
        let imageLabel: string | null = null;
        let hotspot: Rect | null = null;
        const pageInfo = s.image ? pages[s.image.exhibit - 1]?.[s.image.page - 1] : undefined;
        if (s.image && pageInfo && pageInfo.width > 0 && pageInfo.height > 0) {
          const ex = exhibitList[s.image.exhibit - 1];
          imageUrl = pageInfo.url;
          imageLabel = `${ex.name} — page ${s.image.page}`;

          // Clamp the hotspot target (page pixel space) up front.
          let hsPx: Rect | null = null;
          if (s.kind === "hotspot" && s.hotspot) {
            const hx = Math.max(0, Math.min(s.hotspot.x, pageInfo.width - 2));
            const hy = Math.max(0, Math.min(s.hotspot.y, pageInfo.height - 2));
            hsPx = {
              x: hx,
              y: hy,
              w: Math.max(4, Math.min(s.hotspot.width, pageInfo.width - hx)),
              h: Math.max(4, Math.min(s.hotspot.height, pageInfo.height - hy)),
            };
          }

          // Clamp the crop region; ignore degenerate or near-full-page crops.
          let crop: Rect | null = null;
          const r = s.image.region;
          if (r) {
            const x = Math.max(0, Math.min(r.x, pageInfo.width - 1));
            const y = Math.max(0, Math.min(r.y, pageInfo.height - 1));
            const w = Math.max(1, Math.min(r.width, pageInfo.width - x));
            const h = Math.max(1, Math.min(r.height, pageInfo.height - y));
            const nearFull = w * h > 0.9 * pageInfo.width * pageInfo.height;
            if (!nearFull && w >= 60 && h >= 40) crop = { x, y, w, h };
          }
          // The exercise needs its target fully visible — drop any crop that
          // would cut the hotspot off.
          if (crop && hsPx) {
            const inside =
              hsPx.x >= crop.x &&
              hsPx.y >= crop.y &&
              hsPx.x + hsPx.w <= crop.x + crop.w &&
              hsPx.y + hsPx.h <= crop.y + crop.h;
            if (!inside) crop = null;
          }

          if (crop) {
            try {
              const cropBuffer = await sharp(pageInfo.buffer)
                .extract({ left: crop.x, top: crop.y, width: crop.w, height: crop.h })
                .jpeg({ quality: 88 })
                .toBuffer();
              const cropUrl = await uploadJpeg(
                `knowledgeAssets/${testRef.id}/crop-s${si + 1}-ex${s.image.exhibit}-p${s.image.page}.jpg`,
                cropBuffer
              );
              imageUrl = cropUrl;
              imageLabel = `${ex.name} — page ${s.image.page} (detail)`;
              assets.push({ name: `${ex.name} (detail, slide ${si + 1})`, page: s.image.page, url: cropUrl });
            } catch (e) {
              // Fall back to the full page rather than failing the run
              console.error("crop failed, using full page", e);
              crop = null;
            }
          }

          // Normalize the target to fractions of whatever image the slide
          // actually shows (the crop when applied, else the full page).
          if (hsPx) {
            const base = crop ?? { x: 0, y: 0, w: pageInfo.width, h: pageInfo.height };
            const f = (n: number) => Math.round(n * 10000) / 10000;
            hotspot = {
              x: f((hsPx.x - base.x) / base.w),
              y: f((hsPx.y - base.y) / base.h),
              w: f(hsPx.w / base.w),
              h: f(hsPx.h / base.h),
            };
          }
        }
        // A hotspot slide without a usable image + target can't run the
        // exercise — keep its content as a plain screenshot slide instead.
        const kind = s.kind === "hotspot" && (!imageUrl || !hotspot) ? "image" : s.kind;
        return {
          kind,
          imagePosition: s.imagePosition ?? "left",
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
          hotspot,
          hotspotPrompt: s.hotspotPrompt ?? null,
        };
      })
    );

    // Save as a DRAFT test (invisible to employees until published)
    const batch = db.batch();
    batch.set(testRef, {
      name: generated.name,
      description: generated.description,
      maxWrongToPass: generated.maxWrongToPass,
      retakePolicy: "untilPass",
      maxAttempts: 3,
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
