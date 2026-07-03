// AI edit assistant for the slide workbench — the admin types an
// instruction ("simplify slide 4", "add a slide about overtime after
// slide 6", "rewrite question 3 so the answer isn't obvious") and Claude
// returns the full updated test, which we apply: test doc fields + slide
// array + question reconciliation (update by id, add new, delete missing).
//
// Works on the SAVED state — the UI requires saving local edits first.

import * as admin from "firebase-admin";
import {
  ANTHROPIC_API_KEY,
  COLUMNS_ITEMS_SCHEMA,
  ClaudeRefusalError,
  QUESTION_PROPS,
  STEPS_ITEMS_SCHEMA,
  claudeJson,
  managerEndpoint,
  type GeneratedQuestion,
} from "./shared";

const SLIDE_SCHEMA = {
  type: "object" as const,
  properties: {
    kind: { type: "string", enum: ["title", "section", "agenda", "bullets", "steps", "image"] },
    kicker: { type: ["string", "null"] },
    title: { type: "string" },
    subtitle: { type: ["string", "null"] },
    items: { type: ["array", "null"], items: { type: "string" } },
    columns: { type: ["array", "null"], items: COLUMNS_ITEMS_SCHEMA },
    steps: { type: ["array", "null"], items: STEPS_ITEMS_SCHEMA },
    body: { type: ["string", "null"] },
    note: { type: ["string", "null"] },
    imageUrl: {
      type: ["string", "null"],
      description: "MUST be one of the asset URLs provided, or null",
    },
    imageLabel: { type: ["string", "null"] },
    imagePosition: { type: ["string", "null"], enum: ["left", "right", "top", null] },
  },
  required: [
    "kind", "kicker", "title", "subtitle", "items", "columns", "steps",
    "body", "note", "imageUrl", "imageLabel", "imagePosition",
  ],
  additionalProperties: false,
};

const EDIT_SCHEMA = {
  type: "object" as const,
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    maxWrongToPass: { type: "integer" },
    slides: { type: "array", items: SLIDE_SCHEMA },
    questions: {
      type: "array",
      items: {
        type: "object" as const,
        properties: {
          id: {
            type: ["string", "null"],
            description: "Existing question id to keep/update; null for a brand-new question",
          },
          ...QUESTION_PROPS,
        },
        required: ["id", "text", "type", "optionA", "optionB", "optionC", "optionD", "correctAnswer"],
        additionalProperties: false,
      },
    },
  },
  required: ["name", "description", "maxWrongToPass", "slides", "questions"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are the edit assistant for KP Staffing's training-test builder. You receive a test (metadata, slides, quiz questions) plus an admin's instruction, and you return the COMPLETE updated test.

Editing rules:
- Apply the instruction precisely. Everything the instruction doesn't touch must come back EXACTLY as it was — same wording, same order, same fields. You are editing, not regenerating.
- Slide layouts: "title" = the cover (kicker/title/subtitle). "section" = crimson divider (kicker like "SECTION TWO", title, subtitle). "agenda" = numbered list (items). "bullets" = 1-2 columns of headed dash-bullets ("Lead — description" bolds the lead). "steps" = 2-4 sequential steps. "image" = screenshot slide (imageUrl + body + optional note; imagePosition "left"/"right" = side-by-side, "top" = image across the top for wide crops). Each slide sets exactly the fields its kind needs and null for the rest.
- imageUrl values MUST come from the provided asset list (or be null). Never invent URLs. When adding an image slide, pick the most relevant asset by its name.
- Questions: keep the "id" of every question you keep or modify; use id null for new questions; omit a question to delete it. Answers must remain verifiable from the slides. Wrong options plausible, never jokes. TF uses optionA "True", optionB "False", C/D null.
- Never use a personal name for a process contact — say "your admin" or the role title.
- If the instruction asks for something impossible (e.g. an image that doesn't exist in the assets), do the closest sensible thing and leave the rest unchanged.`;

export const editKnowledgeTest = managerEndpoint(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: "1GiB" },
  async (req, res) => {
    const { testId, instruction } = req.body ?? {};
    if (typeof testId !== "string" || !testId) {
      res.status(400).json({ ok: false, error: "Missing testId" });
      return;
    }
    if (typeof instruction !== "string" || instruction.trim().length < 3) {
      res.status(400).json({ ok: false, error: "Tell the assistant what to change" });
      return;
    }

    const db = admin.firestore();
    const testRef = db.collection("knowledgeTests").doc(testId);
    const [testSnap, questionsSnap] = await Promise.all([
      testRef.get(),
      testRef.collection("questions").orderBy("orderNum").get(),
    ]);
    if (!testSnap.exists) {
      res.status(404).json({ ok: false, error: "Test not found" });
      return;
    }
    const test = testSnap.data()!;
    const assets: Array<{ name: string; page: number; url: string }> = test.assets ?? [];
    const currentQuestions = questionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const current = {
      name: test.name,
      description: test.description,
      maxWrongToPass: test.maxWrongToPass,
      slides: test.slides ?? [],
      questions: currentQuestions.map((q: Record<string, unknown>) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC ?? null,
        optionD: q.optionD ?? null,
        correctAnswer: q.correctAnswer,
      })),
    };

    type EditedQuestion = GeneratedQuestion & { id: string | null };
    let edited: {
      name: string;
      description: string;
      maxWrongToPass: number;
      slides: Array<Record<string, unknown>>;
      questions: EditedQuestion[];
    };
    try {
      edited = await claudeJson({
        system: SYSTEM_PROMPT,
        content:
          `Available image assets (for slide imageUrl values):\n` +
          (assets.length
            ? assets.map((a) => `- "${a.name}" (page ${a.page}): ${a.url}`).join("\n")
            : "(none)") +
          `\n\nCurrent test:\n${JSON.stringify(current, null, 2)}\n\nAdmin instruction: ${instruction.trim()}`,
        schema: EDIT_SCHEMA,
      });
    } catch (e) {
      if (e instanceof ClaudeRefusalError) {
        res.status(422).json({ ok: false, error: "The model declined this instruction" });
        return;
      }
      console.error("edit failed", e);
      res.status(502).json({ ok: false, error: `Edit failed: ${(e as Error).message}` });
      return;
    }

    if (!edited.slides?.length && !edited.questions?.length) {
      res.status(502).json({ ok: false, error: "Model returned an empty test" });
      return;
    }

    // Guard: slide images must reference this test's own assets
    const assetUrls = new Set(assets.map((a) => a.url));
    const slides = edited.slides.map((s) => ({
      ...s,
      imageUrl: typeof s.imageUrl === "string" && assetUrls.has(s.imageUrl) ? s.imageUrl : null,
      imageLabel:
        typeof s.imageUrl === "string" && assetUrls.has(s.imageUrl) ? (s.imageLabel ?? null) : null,
      imagePosition: s.imagePosition ?? "left",
    }));

    // Apply: doc fields + question reconciliation
    const batch = db.batch();
    batch.update(testRef, {
      name: edited.name,
      description: edited.description,
      maxWrongToPass: edited.maxWrongToPass,
      slides,
      questionCount: edited.questions.length,
    });
    const existingIds = new Set(currentQuestions.map((q) => q.id));
    const keptIds = new Set<string>();
    edited.questions.forEach((q, i) => {
      const fields = {
        text: q.text,
        type: q.type,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.type === "TF" ? null : (q.optionC ?? null),
        optionD: q.type === "TF" ? null : (q.optionD ?? null),
        correctAnswer: q.correctAnswer,
        orderNum: i + 1,
      };
      if (q.id && existingIds.has(q.id)) {
        keptIds.add(q.id);
        batch.update(testRef.collection("questions").doc(q.id), fields);
      } else {
        batch.set(testRef.collection("questions").doc(), fields);
      }
    });
    for (const q of currentQuestions) {
      if (!keptIds.has(q.id)) batch.delete(testRef.collection("questions").doc(q.id));
    }
    await batch.commit();

    res.json({
      ok: true,
      slideCount: slides.length,
      questionCount: edited.questions.length,
    });
  }
);
