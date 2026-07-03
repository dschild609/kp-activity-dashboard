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
import { randomUUID } from "crypto";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// Opus — content generation quality matters here (training material +
// fair, well-constructed quiz questions), and volume is a few runs a week.
const GENERATION_MODEL = "claude-opus-4-8";

const ALLOWED_ORIGINS = [
  "http://localhost:5183",
  "https://knowledge.kpshub.app",
  "https://kp-knowledge.web.app",
  "https://kp-knowledge.firebaseapp.com",
];

// Roles allowed to generate tests — mirrors canManageTests in the app.
const MANAGER_ROLES = new Set([
  "super_admin",
  "operations_manager",
  "ops_manager",
]);

const MAX_EXHIBITS = 5;
const MAX_EXHIBIT_PAGES = 20; // across all exhibits

interface AuthResult {
  ok: boolean;
  status: number;
  error?: string;
  email?: string;
}

async function verifyManager(authHeader: string | undefined): Promise<AuthResult> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing Authorization header" };
  }
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
    const snap = await admin.firestore().doc(`users/${decoded.uid}`).get();
    const data = snap.data() ?? {};
    const role: string =
      data.role_new ?? data.hubRole ?? (data.role === "admin" ? "super_admin" : "pending");
    if (data.role === "admin" || MANAGER_ROLES.has(role)) {
      return { ok: true, status: 200, email: decoded.email ?? decoded.uid };
    }
    return { ok: false, status: 403, error: "Not authorized to create tests" };
  } catch {
    return { ok: false, status: 401, error: "Invalid token" };
  }
}

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
      description: "Training slides covering the document's substantive content, in teaching order",
      items: {
        type: "object" as const,
        properties: {
          title: { type: "string", description: "Slide heading, a few words" },
          bullets: {
            type: "array",
            items: { type: "string" },
            description: "3-6 concise plain-language bullet points",
          },
          image: {
            type: ["object", "null"],
            description:
              "Exhibit page to display as a screenshot on this slide (1-based numbers matching the exhibits provided), or null for no image",
            properties: {
              exhibit: { type: "integer", description: "1-based exhibit number" },
              page: { type: "integer", description: "1-based page within that exhibit" },
            },
            required: ["exhibit", "page"],
            additionalProperties: false,
          },
        },
        required: ["title", "bullets", "image"],
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

const SYSTEM_PROMPT = `You create internal training material for KP Staffing, a light-industrial staffing company. Given a source document (and possibly exhibit files such as blank forms), you produce:

1. A slide deck that teaches the document's content to staff. Cover ALL substantive content — policies, procedures, rules, numbers, deadlines — in teaching order. Each slide has a short title and 3-6 concise bullets in plain language a busy employee can absorb. Typically 6-15 slides depending on the document's length. Don't pad: no title slide, no "questions?" slide, no bullet that just restates the slide title.

2. Exhibit screenshots: when exhibits are provided (e.g. a blank W-4 form), use them. Set a slide's "image" to the exhibit page that the slide is discussing — for example, a slide walking through Step 2 of a form should display the form page containing Step 2, and a slide about a worked example should show that page. Use images on the slides where seeing the real form genuinely helps; leave "image" null on slides where it wouldn't. Don't force every page onto a slide, and don't repeat the same page on many slides.

3. A quiz of 10-15 questions (fewer only if the document is genuinely thin) that tests understanding of the slide content. Mix multiple-choice (MC, 3-4 options) and true/false (TF) questions. Every answer must be verifiable from the slides. Wrong options should be plausible — the kinds of mistakes someone who skimmed would make — never joke answers. TF questions use optionA "True" and optionB "False" with optionC/optionD null. Spread questions across the whole document, not just the start.

4. maxWrongToPass: about 20% of the question count, rounded down (e.g. 12 questions → 2).

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
    const bucket = admin.storage().bucket();
    const assets: Array<{ name: string; page: number; url: string }> = [];
    // pageUrl[exhibitIdx][pageIdx] -> url
    const pageUrl: string[][] = [];
    try {
      for (let ei = 0; ei < exhibitList.length; ei++) {
        pageUrl.push([]);
        for (let pi = 0; pi < exhibitList[ei].pages.length; pi++) {
          const page = exhibitList[ei].pages[pi];
          const token = randomUUID();
          const path = `knowledgeAssets/${testRef.id}/exhibit-${ei + 1}-page-${page.pageNumber}.jpg`;
          const file = bucket.file(path);
          await file.save(Buffer.from(page.imageBase64, "base64"), {
            contentType: "image/jpeg",
            metadata: { metadata: { firebaseStorageDownloadTokens: token } },
          });
          const url =
            `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
            `${encodeURIComponent(path)}?alt=media&token=${token}`;
          pageUrl[ei].push(url);
          assets.push({
            name: exhibitList[ei].name,
            page: page.pageNumber,
            url,
          });
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
        content.push({
          type: "text",
          text: `Exhibit ${ei + 1}, page ${pi + 1}:`,
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
    let generated: {
      name: string;
      description: string;
      maxWrongToPass: number;
      slides: Array<{
        title: string;
        bullets: string[];
        image: { exhibit: number; page: number } | null;
      }>;
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

    // Resolve slide image references to stored URLs (drop invalid refs)
    const slides = generated.slides.map((s) => {
      let imageUrl: string | null = null;
      let imageLabel: string | null = null;
      if (s.image) {
        const url = pageUrl[s.image.exhibit - 1]?.[s.image.page - 1];
        if (url) {
          imageUrl = url;
          const ex = exhibitList[s.image.exhibit - 1];
          imageLabel = `${ex.name} — page ${s.image.page}`;
        }
      }
      return { title: s.title, bullets: s.bullets, imageUrl, imageLabel };
    });

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
