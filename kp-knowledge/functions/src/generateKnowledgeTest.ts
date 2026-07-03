// AI test generation for KP Knowledge — an admin uploads a Word doc, Claude
// turns it into training slides + a quiz, and we save the result as a DRAFT
// test (isActive: false) for the admin to review, edit, and publish.
//
// Auth: Firebase ID token + admin-tier role check (Cloud Functions run with
// Admin SDK privileges, so this check is the enforcement layer).

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import Anthropic from "@anthropic-ai/sdk";
import * as mammoth from "mammoth";

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

// Structured output schema — Claude must return exactly this shape.
const TEST_SCHEMA = {
  type: "object" as const,
  properties: {
    name: { type: "string", description: "Short test title, e.g. 'Forklift Safety Certification'" },
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
        },
        required: ["title", "bullets"],
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

const SYSTEM_PROMPT = `You create internal training material for KP Staffing, a light-industrial staffing company. Given a source document, you produce:

1. A slide deck that teaches the document's content to staff. Cover ALL substantive content — policies, procedures, rules, numbers, deadlines — in teaching order. Each slide has a short title and 3-6 concise bullets in plain language a busy employee can absorb. Typically 6-15 slides depending on the document's length. Don't pad: no title slide, no "questions?" slide, no bullet that just restates the slide title.

2. A quiz of 10-15 questions (fewer only if the document is genuinely thin) that tests understanding of the slide content. Mix multiple-choice (MC, 3-4 options) and true/false (TF) questions. Every answer must be verifiable from the slides. Wrong options should be plausible — the kinds of mistakes someone who skimmed would make — never joke answers. TF questions use optionA "True" and optionB "False" with optionC/optionD null. Spread questions across the whole document, not just the start.

3. maxWrongToPass: about 20% of the question count, rounded down (e.g. 12 questions → 2).

Base everything strictly on the document. Do not invent policies, numbers, or rules that aren't in it. If the document references a person by name for a process step, keep the role, not the personal name (say "your admin" or the role title).`;

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

    const { filename, data } = req.body ?? {};
    if (typeof data !== "string" || !data) {
      res.status(400).json({ ok: false, error: "Missing base64 'data' field" });
      return;
    }
    if (typeof filename !== "string" || !filename.toLowerCase().endsWith(".docx")) {
      res.status(400).json({ ok: false, error: "Only .docx files are supported" });
      return;
    }

    // Extract text from the Word doc
    let text: string;
    try {
      const buffer = Buffer.from(data, "base64");
      if (buffer.length > 15 * 1024 * 1024) {
        res.status(400).json({ ok: false, error: "File too large (15MB max)" });
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

    // Generate slides + quiz with Claude
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    let generated: {
      name: string;
      description: string;
      maxWrongToPass: number;
      slides: Array<{ title: string; bullets: string[] }>;
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
        messages: [
          {
            role: "user",
            content: `Source document ("${filename}"):\n\n<document>\n${text}\n</document>\n\nCreate the training slides and quiz.`,
          },
        ],
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

    // Save as a DRAFT test (invisible to employees until published)
    const db = admin.firestore();
    const testRef = db.collection("knowledgeTests").doc();
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
      slides: generated.slides,
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
      slideCount: generated.slides.length,
      questionCount: generated.questions.length,
    });
  }
);
