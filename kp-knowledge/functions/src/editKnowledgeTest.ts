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
    kind: { type: "string", enum: ["title", "section", "agenda", "bullets", "steps", "image", "video", "hotspot"] },
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
    // enum alone (no `type`) — the validator rejects a type-array + enum combo.
    imagePosition: { enum: ["left", "right", "top", null] },
    videoUrl: {
      type: ["string", "null"],
      description: "video slides only: the existing video link/URL — pass it through unchanged; null otherwise",
    },
    hotspot: {
      type: ["object", "null"],
      description:
        "hotspot slides only: the click-target as fractions (0-1) of the image — pass it through UNCHANGED unless the instruction is specifically about moving the target; null otherwise",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        w: { type: "number" },
        h: { type: "number" },
      },
      required: ["x", "y", "w", "h"],
      additionalProperties: false,
    },
    hotspotPrompt: {
      type: ["string", "null"],
      description: "hotspot slides only: the find-it instruction shown to the trainee; null otherwise",
    },
  },
  required: [
    "kind", "kicker", "title", "subtitle", "items", "columns", "steps",
    "body", "note", "imageUrl", "imageLabel", "imagePosition", "videoUrl",
    "hotspot", "hotspotPrompt",
  ],
  additionalProperties: false,
};

export const EDIT_SCHEMA = {
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
- Slide layouts: "title" = the cover (kicker/title/subtitle). "section" = crimson divider (kicker like "SECTION TWO", title, subtitle). "agenda" = numbered list (items). "bullets" = 1-2 columns of headed dash-bullets ("Lead — description" bolds the lead). "steps" = 2-4 sequential steps. "image" = screenshot slide (imageUrl + body + optional note; imagePosition "left"/"right" = side-by-side, "top" = image across the top for wide crops). "video" = a training video (videoUrl holds a link or uploaded-file URL — pass it through UNCHANGED; you can edit its title/kicker). "hotspot" = an interactive find-it exercise: the trainee must CLICK the hotspot region on the screenshot to continue (hotspotPrompt = the instruction, hotspot = the target as 0-1 fractions of the image, note = explanation shown after they find it) — pass the hotspot rectangle through UNCHANGED unless the instruction is specifically about the target; you may edit its prompt/title/note text. Each slide sets exactly the fields its kind needs and null for the rest. Never invent a video slide or a videoUrl; only keep ones already present.
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

    // Guard: slide images must reference this test's own assets, and hotspot
    // targets must be sane 0-1 fractions on a slide that actually has an image.
    const assetUrls = new Set(assets.map((a) => a.url));
    const clamp01 = (n: unknown): number | null =>
      typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
    const slides = edited.slides.map((s) => {
      const imageOk = typeof s.imageUrl === "string" && assetUrls.has(s.imageUrl);
      let hotspot: { x: number; y: number; w: number; h: number } | null = null;
      if (imageOk && s.hotspot && typeof s.hotspot === "object") {
        const r = s.hotspot as Record<string, unknown>;
        const x = clamp01(r.x), y = clamp01(r.y), w = clamp01(r.w), h = clamp01(r.h);
        if (x != null && y != null && w != null && h != null && w > 0 && h > 0) {
          hotspot = { x, y, w, h };
        }
      }
      return {
        ...s,
        imageUrl: imageOk ? s.imageUrl : null,
        imageLabel: imageOk ? (s.imageLabel ?? null) : null,
        imagePosition: s.imagePosition ?? "left",
        hotspot,
        hotspotPrompt: typeof s.hotspotPrompt === "string" ? s.hotspotPrompt : null,
      };
    });

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
