import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import {
  makeSlide,
  type AnswerKey,
  type KnowledgeAsset,
  type KnowledgeAttempt,
  type KnowledgeQuestion,
  type KnowledgeSlide,
  type KnowledgeTest,
  type RetakePolicy,
  type SlideKind,
} from "../types/knowledge";
import { SlideView, move, sectionNumberAt } from "../components/SlideView";
import { SnipModal } from "../components/SnipModal";
import { Field, NoticeBox, Pill, SmallButton } from "../components/ui";
import {
  addQuestion,
  deleteQuestion,
  getQuestions,
  getTest,
  listAttempts,
  updateQuestion,
  updateTest,
} from "../lib/knowledge";
import { editTestWithAI, snipTestAsset, uploadTestAssets } from "../lib/aiGenerate";
import { renderExhibit } from "../lib/exhibitPages";

/* Review-and-edit surface for a test — the approval gate for AI-generated
 * drafts. Everything is editable: metadata, slides, and questions. Publish
 * flips the test live for employees. */
export function AdminTestEditorPage() {
  const { testId } = useParams<{ testId: string }>();
  const { canManage } = useOutletContext<AuthState>();

  const [test, setTest] = useState<KnowledgeTest | null>(null);
  const [questions, setQuestions] = useState<KnowledgeQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // Local editable copies of the metadata + slides. Assets are local too so
  // an upload can append without a reload clobbering unsaved slide edits.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maxWrong, setMaxWrong] = useState(0);
  const [tags, setTags] = useState("");
  const [retakePolicy, setRetakePolicy] = useState<RetakePolicy>("untilPass");
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [slides, setSlides] = useState<KnowledgeSlide[]>([]);
  const [assets, setAssets] = useState<KnowledgeAsset[]>([]);
  const [attempts, setAttempts] = useState<KnowledgeAttempt[]>([]);
  const [dirty, setDirty] = useState(false);

  /* Per-question stats from every recorded attempt: how often it was
   * missed, and which options people picked (bad questions show up fast) */
  const questionStats = useMemo(() => {
    const map = new Map<string, { n: number; wrong: number; counts: Record<string, number> }>();
    for (const a of attempts) {
      for (const [qid, g] of Object.entries(a.answers ?? {})) {
        const s = map.get(qid) ?? { n: 0, wrong: 0, counts: {} };
        s.n += 1;
        if (!g.isCorrect) s.wrong += 1;
        const picked = g.given ?? "blank";
        s.counts[picked] = (s.counts[picked] ?? 0) + 1;
        map.set(qid, s);
      }
    }
    return map;
  }, [attempts]);

  useEffect(() => {
    if (!testId) return;
    listAttempts({ testId }).then(setAttempts).catch(() => {});
  }, [testId]);

  const reload = useCallback(async () => {
    if (!testId) return;
    try {
      const [t, qs] = await Promise.all([getTest(testId), getQuestions(testId)]);
      if (!t) { setError("Test not found."); return; }
      setTest(t);
      setQuestions(qs);
      setName(t.name);
      setDescription(t.description);
      setMaxWrong(t.maxWrongToPass);
      setTags(t.tags.join(", "));
      setRetakePolicy(t.retakePolicy);
      setMaxAttempts(t.maxAttempts);
      setSlides(t.slides);
      setAssets(t.assets);
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [testId]);
  useEffect(() => { void reload(); }, [reload]);

  if (!canManage) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-16 text-center text-[14px] text-kp-text-muted">
        You don't have access to the test editor.
      </main>
    );
  }
  if (error) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-16 text-center">
        <div className="text-[14px] text-kp-bad mb-4">{error}</div>
        <Link to="/admin" className="text-[13.5px] font-semibold text-kp-crimson hover:underline">
          ← Back to Admin
        </Link>
      </main>
    );
  }
  if (!test || !testId) {
    return <main className="max-w-4xl mx-auto px-6 py-16 text-center text-[14px] text-kp-text-muted">Loading…</main>;
  }

  const markDirty = () => setDirty(true);

  async function refreshQuestions() {
    if (testId) setQuestions(await getQuestions(testId));
  }

  const metaFields = () => ({
    name,
    description,
    maxWrongToPass: maxWrong,
    retakePolicy,
    maxAttempts,
    tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    slides,
  });

  async function saveMeta() {
    setSaving("meta");
    try {
      await updateTest(testId!, metaFields());
      await reload();
    } finally {
      setSaving(null);
    }
  }

  async function publish(next: boolean) {
    setSaving("publish");
    try {
      await updateTest(testId!, {
        ...metaFields(),
        isActive: next,
        status: next ? "published" : "draft",
      });
      await reload();
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <Link to="/admin" className="text-[13px] font-semibold text-kp-text-muted hover:text-kp-navy">
          ← Admin
        </Link>
        {test.status === "draft" ? (
          <Pill tone="warn">Draft — not visible to staff</Pill>
        ) : (
          <Pill tone="good">Published</Pill>
        )}
        {test.aiGenerated && (
          <span className="font-mono text-[11px] font-extrabold tracking-[0.04em] bg-kp-violet text-white px-2 py-0.5 rounded-[5px]">
            AI
          </span>
        )}
        {test.sourceDocName && (
          <span className="text-[12px] text-kp-text-faint">from {test.sourceDocName}</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-4 mb-8">
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-kp-navy">
          {test.name}
        </h1>
        <Link
          to={`/admin/tests/${testId}/preview`}
          className="shrink-0 px-4 py-2 text-[13.5px] font-semibold text-kp-text border border-kp-border rounded-lg hover:bg-kp-surface transition-colors"
          title="Walk through the slides and quiz as an employee — nothing is recorded"
        >
          ▶ Preview as employee
        </Link>
      </div>

      {/* ── Metadata ── */}
      <section className="mb-10">
        <h2 className="kp-kicker mb-4">Test Details</h2>
        <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-5 space-y-3">
          <Field label="Name" value={name} onChange={(v) => { setName(v); markDirty(); }} />
          <Field label="Description" value={description} onChange={(v) => { setDescription(v); markDirty(); }} />
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="font-mono text-[11px] uppercase text-kp-text-faint">
                Wrong answers allowed to pass
              </span>
              <input
                type="number"
                min={0}
                value={maxWrong}
                onChange={(e) => { setMaxWrong(Math.max(0, Number(e.target.value) || 0)); markDirty(); }}
                className="focus-kp mt-1 w-full bg-kp-surface border border-kp-border rounded-lg px-2.5 py-1.5 text-[13.5px]"
              />
            </label>
            <Field label="Tags (comma-separated)" value={tags} onChange={(v) => { setTags(v); markDirty(); }} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="font-mono text-[11px] uppercase text-kp-text-faint">Retakes</span>
              <select
                value={retakePolicy}
                onChange={(e) => { setRetakePolicy(e.target.value as RetakePolicy); markDirty(); }}
                className="focus-kp mt-1 w-full bg-kp-surface border border-kp-border rounded-lg px-2.5 py-1.5 text-[13.5px]"
              >
                <option value="untilPass">Retake until passed</option>
                <option value="limited">Limited attempts</option>
                <option value="single">Single attempt (admin resets)</option>
              </select>
            </label>
            {retakePolicy === "limited" && (
              <label className="block">
                <span className="font-mono text-[11px] uppercase text-kp-text-faint">Max attempts</span>
                <input
                  type="number"
                  min={1}
                  value={maxAttempts}
                  onChange={(e) => { setMaxAttempts(Math.max(1, Number(e.target.value) || 1)); markDirty(); }}
                  className="focus-kp mt-1 w-full bg-kp-surface border border-kp-border rounded-lg px-2.5 py-1.5 text-[13.5px]"
                />
              </label>
            )}
          </div>
        </div>
      </section>

      {/* ── AI Assistant ── */}
      <section className="mb-10">
        <h2 className="kp-kicker mb-4">AI Assistant</h2>
        <AiAssistant testId={testId} dirty={dirty} onApplied={reload} />
      </section>

      {/* ── Slides ── */}
      <section className="mb-10">
        <h2 className="kp-kicker mb-4">Slides ({slides.length})</h2>
        <SlideWorkbench
          testId={testId}
          slides={slides}
          assets={assets}
          onAssetsAdded={(added) => setAssets((prev) => [...prev, ...added])}
          onChange={(next) => {
            setSlides(next);
            markDirty();
          }}
        />
      </section>

      {/* ── Questions ── */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="kp-kicker">Questions ({questions.length})</h2>
          <SmallButton
            onClick={async () => {
              await addQuestion(testId, {
                text: "New question",
                type: "MC",
                optionA: "",
                optionB: "",
                optionC: null,
                optionD: null,
                correctAnswer: "A",
              });
              await refreshQuestions();
            }}
          >
            + Add question
          </SmallButton>
        </div>
        <div className="space-y-3">
          {questions.map((q, i) => (
            <QuestionEditor
              key={q.id}
              index={i}
              question={q}
              stats={questionStats.get(q.id)}
              onSave={async (fields) => {
                await updateQuestion(testId, q.id, fields);
                await refreshQuestions();
              }}
              onDelete={async () => {
                if (!window.confirm("Delete this question?")) return;
                await deleteQuestion(testId, q.id);
                await refreshQuestions();
              }}
            />
          ))}
        </div>
      </section>

      {/* ── Actions ── */}
      <div className="sticky bottom-0 bg-kp-bg border-t border-kp-border-soft py-4 flex items-center gap-3">
        <button
          type="button"
          disabled={saving !== null || !dirty}
          onClick={saveMeta}
          className="px-4 py-2.5 bg-kp-navy hover:bg-kp-navy-hover text-white text-[13.5px] font-semibold rounded-lg transition-colors disabled:opacity-40"
        >
          {saving === "meta" ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
        {test.status === "draft" ? (
          <button
            type="button"
            disabled={saving !== null}
            onClick={() => publish(true)}
            className="px-4 py-2.5 bg-kp-crimson hover:bg-kp-crimson-hover text-white text-[13.5px] font-semibold rounded-lg transition-colors disabled:opacity-40"
          >
            {saving === "publish" ? "Publishing…" : "Approve & Publish"}
          </button>
        ) : (
          <button
            type="button"
            disabled={saving !== null}
            onClick={() => publish(false)}
            className="px-4 py-2.5 text-[13.5px] font-semibold text-kp-text border border-kp-border rounded-lg hover:bg-kp-surface transition-colors disabled:opacity-40"
          >
            {saving === "publish" ? "Working…" : "Unpublish (back to draft)"}
          </button>
        )}
        {dirty && (
          <span className="text-[12.5px] text-kp-warn font-semibold">Unsaved changes</span>
        )}
      </div>
    </main>
  );
}

/* ── Slide editor card ───────────────────────────────────────────── */

/* Natural-language edits applied to the saved test via Claude — "simplify
 * slide 4", "add a slide about overtime", "rewrite question 3". Requires a
 * clean (saved) state so the assistant and the admin never edit different
 * versions. */
function AiAssistant({
  testId,
  dirty,
  onApplied,
}: {
  testId: string;
  dirty: boolean;
  onApplied: () => Promise<void>;
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  async function apply() {
    if (busy || dirty || instruction.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setDoneMsg(null);
    try {
      await editTestWithAI(testId, instruction.trim());
      await onApplied();
      setDoneMsg(`Applied: "${instruction.trim()}" — review the changes below.`);
      setInstruction("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-5">
      <div className="flex gap-3">
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void apply(); }}
          disabled={busy}
          placeholder='e.g. "Simplify slide 4" · "Add a slide about overtime after slide 6" · "Rewrite question 3 so the answer is less obvious"'
          className="focus-kp flex-1 bg-kp-surface border border-kp-border rounded-lg px-3 py-2 text-[13.5px] disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void apply()}
          disabled={busy || dirty || instruction.trim().length < 3}
          className="px-4 py-2 bg-kp-violet hover:opacity-90 text-white text-[13.5px] font-semibold rounded-lg transition-opacity disabled:opacity-40"
        >
          {busy ? "Applying…" : "✨ Apply"}
        </button>
      </div>
      <div className="mt-2 text-[12px] text-kp-text-faint">
        {dirty
          ? "Save your changes first — the assistant edits the saved version."
          : busy
            ? "Rewriting the test — this can take a minute…"
            : "The assistant edits slides, questions, and settings; everything it changes shows up below for review before you publish."}
      </div>
      {error && <NoticeBox tone="bad" className="mt-3">{error}</NoticeBox>}
      {doneMsg && <NoticeBox tone="good" className="mt-3">{doneMsg}</NoticeBox>}
    </div>
  );
}

/* Layout options offered in the menus. The two screenshot variants share
 * kind "image" and differ by imagePosition. */
const SLIDE_LAYOUTS: Array<{
  value: string;
  kind: SlideKind;
  imagePosition?: "left" | "top";
  label: string;
}> = [
  { value: "title", kind: "title", label: "Title (cover)" },
  { value: "section", kind: "section", label: "Section divider" },
  { value: "agenda", kind: "agenda", label: "Agenda (numbered list)" },
  { value: "bullets", kind: "bullets", label: "Bullets (1-2 columns)" },
  { value: "steps", kind: "steps", label: "Process steps" },
  { value: "image", kind: "image", imagePosition: "left", label: "Screenshot — text beside" },
  { value: "image-top", kind: "image", imagePosition: "top", label: "Screenshot — text below" },
];

function layoutValueOf(slide: KnowledgeSlide): string {
  if (slide.kind === "image") return slide.imagePosition === "top" ? "image-top" : "image";
  return slide.kind;
}

function newSlide(layoutValue: string): KnowledgeSlide {
  const layout = SLIDE_LAYOUTS.find((l) => l.value === layoutValue) ?? SLIDE_LAYOUTS[3];
  const kind = layout.kind;
  return makeSlide({
    kind,
    title: "New slide",
    items: kind === "agenda" ? ["First item"] : null,
    columns: kind === "bullets" ? [{ heading: "", bullets: [""] }] : null,
    steps: kind === "steps" ? [{ title: "Step one", description: "" }] : null,
    imagePosition: layout.imagePosition,
  });
}

/* Switch a slide to a different template layout, carrying its text along.
 * Text lines are pooled from whatever the old layout held, then poured
 * into the shape the new layout needs. */
function convertSlide(slide: KnowledgeSlide, kind: SlideKind): KnowledgeSlide {
  if (kind === slide.kind) return slide;

  const lines: string[] = [
    ...(slide.items ?? []),
    ...(slide.columns ?? []).flatMap((c) => c.bullets),
    ...(slide.steps ?? []).map((s) => (s.description ? `${s.title} — ${s.description}` : s.title)),
    ...(slide.body ? [slide.body] : []),
    ...(slide.subtitle ? [slide.subtitle] : []),
  ].filter((l) => l.trim());

  const base: KnowledgeSlide = {
    kind,
    kicker: slide.kicker,
    title: slide.title,
    subtitle: null,
    items: null,
    columns: null,
    steps: null,
    body: null,
    note: slide.note,
    imageUrl: slide.imageUrl ?? null,
    imageLabel: slide.imageLabel ?? null,
    imagePosition: slide.imagePosition,
  };

  switch (kind) {
    case "title":
    case "section":
      return { ...base, subtitle: lines[0] ?? null, note: null };
    case "agenda":
      return { ...base, items: lines.length ? lines : ["First item"], note: null };
    case "bullets": {
      const cols = slide.columns?.length
        ? slide.columns
        : [{ heading: "", bullets: lines.length ? lines : [""] }];
      return { ...base, columns: cols, note: null };
    }
    case "steps":
      return {
        ...base,
        note: null,
        steps: (lines.length ? lines : ["Step one"]).slice(0, 4).map((l) => {
          const sep = l.indexOf(" — ");
          return sep > 0
            ? { title: l.slice(0, sep), description: l.slice(sep + 3) }
            : { title: l, description: "" };
        }),
      };
    case "image":
      return { ...base, body: lines.join(" ") || null };
  }
}

function AddSlideSelect({ onAdd, compact }: { onAdd: (layoutValue: string) => void; compact?: boolean }) {
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onAdd(e.target.value);
      }}
      className={`focus-kp bg-kp-surface border border-kp-border rounded-lg font-semibold text-kp-text-muted ${
        compact ? "w-full px-1.5 py-1.5 text-[11.5px]" : "px-2.5 py-1.5 text-[12.5px]"
      }`}
    >
      <option value="">+ Add slide…</option>
      {SLIDE_LAYOUTS.map((l) => (
        <option key={l.value} value={l.value}>{l.label}</option>
      ))}
    </select>
  );
}

/* Filmstrip thumbnail — memoized so typing in Test Details (which re-renders
 * the page) doesn't re-render every scaled-down SlideView. */
const Thumb = memo(function Thumb({
  slide,
  index,
  sectionNumber,
  selected,
  onSelect,
}: {
  slide: KnowledgeSlide;
  index: number;
  sectionNumber: number;
  selected: boolean;
  onSelect: (i: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      className={`block w-full rounded-lg overflow-hidden border-2 transition-colors ${
        selected ? "border-kp-crimson" : "border-kp-border hover:border-kp-border-strong"
      }`}
      title={slide.title}
    >
      <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
        <div
          className="absolute top-0 left-0 pointer-events-none"
          style={{ width: 896, transform: "scale(0.1607)", transformOrigin: "top left" }}
        >
          <SlideView slide={slide} sectionNumber={sectionNumber} />
        </div>
      </div>
      <div className="font-mono text-[9.5px] py-0.5 bg-kp-surface text-kp-text-faint">
        {index + 1}
      </div>
    </button>
  );
});

function SlideWorkbench({
  testId,
  slides,
  assets,
  onAssetsAdded,
  onChange,
}: {
  testId: string;
  slides: KnowledgeSlide[];
  assets: KnowledgeAsset[];
  onAssetsAdded: (added: KnowledgeAsset[]) => void;
  onChange: (next: KnowledgeSlide[]) => void;
}) {
  const [selected, setSelected] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [snipping, setSnipping] = useState(false);
  const index = Math.min(selected, Math.max(slides.length - 1, 0));
  const slide = slides[index];

  async function handleSnip(region: { x: number; y: number; w: number; h: number }) {
    if (!slide?.imageUrl) return;
    const sourceName =
      assets.find((a) => a.url === slide.imageUrl)?.name ?? slide.imageLabel ?? "image";
    const snipCount = assets.filter((a) => a.name.startsWith(`${sourceName} (snip`)).length;
    const asset = await snipTestAsset(
      testId,
      `${sourceName} (snip ${snipCount + 1})`,
      slide.imageUrl,
      region
    );
    onAssetsAdded([asset]);
    onChange(
      slides.map((s, j) =>
        j === index ? { ...s, imageUrl: asset.url, imageLabel: asset.name } : s
      )
    );
    setSnipping(false);
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const exhibit = await renderExhibit(file);
      const added = await uploadTestAssets(testId, exhibit);
      onAssetsAdded(added);
      // Drop the uploaded image straight onto the current slide
      if (added.length > 0 && slide) {
        const a = added[0];
        onChange(
          slides.map((s, j) =>
            j === index
              ? {
                  ...s,
                  kind: "image" as const,
                  imageUrl: a.url,
                  imageLabel: added.length > 1 ? `${a.name} — page ${a.page}` : a.name,
                }
              : s
          )
        );
      }
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const update = (next: KnowledgeSlide) =>
    onChange(slides.map((s, j) => (j === index ? next : s)));

  const moveSlide = (dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= slides.length) return;
    onChange(move(slides, index, dir));
    setSelected(j);
  };

  const addSlideAt = (position: number) => (layoutValue: string) => {
    const next = [...slides];
    next.splice(position, 0, newSlide(layoutValue));
    onChange(next);
    setSelected(position);
  };

  if (slides.length === 0) {
    return (
      <div className="text-[13.5px] text-kp-text-muted bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-5 flex items-center gap-4">
        No slides — employees go straight to the quiz.
        <AddSlideSelect onAdd={addSlideAt(0)} />
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      {/* Filmstrip */}
      <div className="w-[150px] shrink-0 space-y-2 max-h-[640px] overflow-y-auto pr-1">
        {slides.map((s, i) => (
          <Thumb
            key={i}
            slide={s}
            index={i}
            sectionNumber={sectionNumberAt(slides, i)}
            selected={i === index}
            onSelect={setSelected}
          />
        ))}
        <AddSlideSelect compact onAdd={addSlideAt(index + 1)} />
      </div>

      {/* Canvas + toolbar */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <label className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-kp-text-faint">
            Layout
          </label>
          <select
            value={layoutValueOf(slide)}
            onChange={(e) => {
              const layout = SLIDE_LAYOUTS.find((l) => l.value === e.target.value);
              if (!layout) return;
              const converted = convertSlide(slide, layout.kind);
              update(
                layout.kind === "image"
                  ? { ...converted, imagePosition: layout.imagePosition ?? "left" }
                  : converted
              );
            }}
            className="focus-kp bg-kp-surface border border-kp-border rounded-lg px-2 py-1.5 text-[12.5px] font-semibold"
          >
            {SLIDE_LAYOUTS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>

          <label className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-kp-text-faint ml-2">
            Image
          </label>
          <select
            value={slide.imageUrl ?? ""}
            onChange={(e) => {
              const url = e.target.value || null;
              const asset = assets.find((a) => a.url === url);
              update({
                ...slide,
                imageUrl: url,
                imageLabel: asset ? `${asset.name} — page ${asset.page}` : null,
                ...(url && slide.kind !== "image" ? { kind: "image" as const } : null),
              });
            }}
            className="focus-kp bg-kp-surface border border-kp-border rounded-lg px-2 py-1.5 text-[12.5px] max-w-[220px]"
            disabled={assets.length === 0}
            title={assets.length === 0 ? "Upload an image to get started" : undefined}
          >
            <option value="">{assets.length === 0 ? "No images yet" : "None"}</option>
            {assets.map((a) => (
              <option key={a.url} value={a.url}>
                {a.name} — page {a.page}
              </option>
            ))}
          </select>
          <label
            className={`px-2.5 py-1.5 text-[12.5px] font-semibold border rounded-lg transition-colors ${
              uploading
                ? "opacity-50 cursor-wait border-kp-border text-kp-text-faint"
                : "cursor-pointer text-kp-text-muted border-kp-border hover:bg-kp-surface-alt hover:text-kp-navy"
            }`}
            title="Upload an image or PDF to this test's library"
          >
            {uploading ? "Uploading…" : "⬆ Upload…"}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
                e.target.value = "";
              }}
            />
          </label>

          <div className="ml-auto flex gap-2">
            <SmallButton onClick={() => moveSlide(-1)} disabled={index === 0}>← Move</SmallButton>
            <SmallButton onClick={() => moveSlide(1)} disabled={index === slides.length - 1}>Move →</SmallButton>
            <SmallButton
              onClick={() => {
                const next = [...slides];
                next.splice(index + 1, 0, JSON.parse(JSON.stringify(slide)));
                onChange(next);
                setSelected(index + 1);
              }}
            >
              Duplicate
            </SmallButton>
            <SmallButton
              tone="danger"
              onClick={() => {
                onChange(slides.filter((_, j) => j !== index));
                setSelected(Math.max(0, index - 1));
              }}
            >
              Delete
            </SmallButton>
          </div>
        </div>

        <SlideView
          slide={slide}
          sectionNumber={sectionNumberAt(slides, index)}
          onChange={update}
          onSnip={slide.imageUrl ? () => setSnipping(true) : undefined}
        />

        {snipping && slide.imageUrl && (
          <SnipModal
            imageUrl={slide.imageUrl}
            onCancel={() => setSnipping(false)}
            onConfirm={handleSnip}
          />
        )}

        {uploadError && <NoticeBox tone="bad" className="mt-3">{uploadError}</NoticeBox>}
        <p className="mt-2 text-[12px] text-kp-text-faint">
          Click any text on the slide to edit it · hover a row for reorder/remove controls ·
          Slide {index + 1} of {slides.length}
        </p>
      </div>
    </div>
  );
}
/* ── Question editor card ────────────────────────────────────────── */

function MissPill({ stats }: { stats?: { n: number; wrong: number } }) {
  if (!stats || stats.n === 0) return null;
  const pct = Math.round((stats.wrong / stats.n) * 100);
  const tone =
    pct >= 60
      ? "text-kp-bad bg-kp-bad-bg border-kp-bad-border"
      : pct >= 30
        ? "text-kp-warn bg-kp-warn-bg border-kp-warn-border"
        : "text-kp-good bg-kp-good-bg border-kp-good-border";
  return (
    <span
      className={`shrink-0 px-1.5 py-0.5 text-[11px] font-bold rounded-[5px] border ${tone}`}
      title={`${stats.wrong} of ${stats.n} attempts got this wrong`}
    >
      missed {pct}% · {stats.n} taken
    </span>
  );
}

function QuestionEditor({
  index,
  question,
  stats,
  onSave,
  onDelete,
}: {
  index: number;
  question: KnowledgeQuestion;
  stats?: { n: number; wrong: number; counts: Record<string, number> };
  onSave: (fields: Partial<Omit<KnowledgeQuestion, "id">>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(question.text);
  const [type, setType] = useState(question.type);
  const [optionA, setOptionA] = useState(question.optionA);
  const [optionB, setOptionB] = useState(question.optionB);
  const [optionC, setOptionC] = useState(question.optionC ?? "");
  const [optionD, setOptionD] = useState(question.optionD ?? "");
  const [correct, setCorrect] = useState<AnswerKey>(question.correctAnswer);
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-4 flex items-start gap-3">
        <span className="font-mono text-[11px] font-bold text-kp-text-faint mt-0.5">
          Q{index + 1}
        </span>
        <div className="flex-1">
          <div className="text-[14px] font-semibold text-kp-text">{question.text}</div>
          <div className="text-[12.5px] text-kp-text-faint mt-0.5">
            {question.type} · correct: {question.correctAnswer} —{" "}
            {{ A: question.optionA, B: question.optionB, C: question.optionC, D: question.optionD }[
              question.correctAnswer
            ]}
            {stats && stats.n > 0 && (
              <span>
                {" "}· picks:{" "}
                {(["A", "B", "C", "D", "blank"] as const)
                  .filter((k) => stats.counts[k])
                  .map((k) => `${k} ${stats.counts[k]}`)
                  .join(" · ")}
              </span>
            )}
          </div>
        </div>
        <MissPill stats={stats} />
        <SmallButton onClick={() => setEditing(true)}>Edit</SmallButton>
        <SmallButton tone="danger" onClick={() => void onDelete()}>Delete</SmallButton>
      </div>
    );
  }

  const isTF = type === "TF";
  return (
    <div className="bg-kp-surface-alt border border-kp-border rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] font-bold text-kp-text-faint">Q{index + 1}</span>
        <select
          value={type}
          onChange={(e) => {
            const next = e.target.value as "MC" | "TF";
            setType(next);
            if (next === "TF") {
              setOptionA("True");
              setOptionB("False");
              setOptionC("");
              setOptionD("");
              if (correct !== "A" && correct !== "B") setCorrect("A");
            }
          }}
          className="focus-kp bg-kp-surface border border-kp-border rounded-lg px-2 py-1 text-[12.5px]"
        >
          <option value="MC">Multiple choice</option>
          <option value="TF">True / False</option>
        </select>
      </div>
      <Field label="Question" value={text} onChange={setText} />
      <div className="grid sm:grid-cols-2 gap-2">
        <Field label="Option A" value={optionA} onChange={setOptionA} disabled={isTF} />
        <Field label="Option B" value={optionB} onChange={setOptionB} disabled={isTF} />
        {!isTF && (
          <>
            <Field label="Option C (optional)" value={optionC} onChange={setOptionC} />
            <Field label="Option D (optional)" value={optionD} onChange={setOptionD} />
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="font-mono text-[11px] uppercase text-kp-text-faint">Correct</label>
        <select
          value={correct}
          onChange={(e) => setCorrect(e.target.value as AnswerKey)}
          className="focus-kp bg-kp-surface border border-kp-border rounded-lg px-2 py-1.5 text-[13px]"
        >
          {(isTF ? (["A", "B"] as const) : (["A", "B", "C", "D"] as const)).map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <SmallButton onClick={() => setEditing(false)}>Cancel</SmallButton>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({
                  text,
                  type,
                  optionA,
                  optionB,
                  optionC: isTF ? null : optionC || null,
                  optionD: isTF ? null : optionD || null,
                  correctAnswer: correct,
                });
                setEditing(false);
              } finally {
                setSaving(false);
              }
            }}
            className="px-3 py-1.5 bg-kp-crimson hover:bg-kp-crimson-hover text-white text-[12.5px] font-semibold rounded-lg disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

