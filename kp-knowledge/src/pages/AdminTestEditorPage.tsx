import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import { canManageTests } from "../types/roles";
import type {
  AnswerKey,
  KnowledgeQuestion,
  KnowledgeSlide,
  KnowledgeTest,
} from "../types/knowledge";
import {
  addQuestion,
  deleteQuestion,
  getQuestions,
  getTest,
  updateQuestion,
  updateTest,
} from "../lib/knowledge";

/* Review-and-edit surface for a test — the approval gate for AI-generated
 * drafts. Everything is editable: metadata, slides, and questions. Publish
 * flips the test live for employees. */
export function AdminTestEditorPage() {
  const { testId } = useParams<{ testId: string }>();
  const { role } = useOutletContext<AuthState>();

  const [test, setTest] = useState<KnowledgeTest | null>(null);
  const [questions, setQuestions] = useState<KnowledgeQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // Local editable copies of the metadata + slides
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maxWrong, setMaxWrong] = useState(0);
  const [tags, setTags] = useState("");
  const [slides, setSlides] = useState<KnowledgeSlide[]>([]);
  const [dirty, setDirty] = useState(false);

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
      setSlides(t.slides);
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [testId]);
  useEffect(() => { void reload(); }, [reload]);

  if (!canManageTests(role)) {
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

  async function saveMeta() {
    setSaving("meta");
    try {
      await updateTest(testId!, {
        name,
        description,
        maxWrongToPass: maxWrong,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        slides,
      });
      await reload();
    } finally {
      setSaving(null);
    }
  }

  async function publish(next: boolean) {
    setSaving("publish");
    try {
      if (dirty) {
        await updateTest(testId!, {
          name,
          description,
          maxWrongToPass: maxWrong,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          slides,
        });
      }
      await updateTest(testId!, { isActive: next, status: next ? "published" : "draft" });
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
          <span className="px-2 py-0.5 text-[12.5px] font-bold rounded-[6px] border text-kp-warn bg-kp-warn-bg border-kp-warn-border">
            Draft — not visible to staff
          </span>
        ) : (
          <span className="px-2 py-0.5 text-[12.5px] font-bold rounded-[6px] border text-kp-good bg-kp-good-bg border-kp-good-border">
            Published
          </span>
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
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-kp-navy mb-8">
        {test.name}
      </h1>

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
        </div>
      </section>

      {/* ── Slides ── */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="kp-kicker">Slides ({slides.length})</h2>
          <SmallButton
            onClick={() => { setSlides([...slides, { title: "New slide", bullets: [""] }]); markDirty(); }}
          >
            + Add slide
          </SmallButton>
        </div>
        {slides.length === 0 && (
          <div className="text-[13.5px] text-kp-text-muted bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-5">
            No slides — employees go straight to the quiz.
          </div>
        )}
        <div className="space-y-3">
          {slides.map((slide, i) => (
            <SlideEditor
              key={i}
              index={i}
              total={slides.length}
              slide={slide}
              onChange={(next) => {
                setSlides(slides.map((s, j) => (j === i ? next : s)));
                markDirty();
              }}
              onMove={(dir) => {
                const j = i + dir;
                if (j < 0 || j >= slides.length) return;
                const next = [...slides];
                [next[i], next[j]] = [next[j], next[i]];
                setSlides(next);
                markDirty();
              }}
              onDelete={() => {
                setSlides(slides.filter((_, j) => j !== i));
                markDirty();
              }}
            />
          ))}
        </div>
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
              await reload();
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
              onSave={async (fields) => {
                await updateQuestion(testId, q.id, fields);
                await reload();
              }}
              onDelete={async () => {
                if (!window.confirm("Delete this question?")) return;
                await deleteQuestion(testId, q.id);
                await reload();
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

function SlideEditor({
  index,
  total,
  slide,
  onChange,
  onMove,
  onDelete,
}: {
  index: number;
  total: number;
  slide: KnowledgeSlide;
  onChange: (next: KnowledgeSlide) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-[11px] font-bold text-kp-text-faint">
          SLIDE {index + 1}
        </span>
        <input
          value={slide.title}
          onChange={(e) => onChange({ ...slide, title: e.target.value })}
          className="focus-kp flex-1 bg-transparent border border-transparent hover:border-kp-border rounded-lg px-2 py-1 text-[15px] font-bold text-kp-text"
        />
        <SmallButton onClick={() => onMove(-1)} disabled={index === 0}>↑</SmallButton>
        <SmallButton onClick={() => onMove(1)} disabled={index === total - 1}>↓</SmallButton>
        <SmallButton tone="danger" onClick={onDelete}>Delete</SmallButton>
      </div>
      <div className="space-y-1.5 pl-2">
        {slide.bullets.map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-kp-crimson text-[13px]">•</span>
            <input
              value={b}
              onChange={(e) =>
                onChange({ ...slide, bullets: slide.bullets.map((x, j) => (j === i ? e.target.value : x)) })
              }
              className="focus-kp flex-1 bg-transparent border border-transparent hover:border-kp-border rounded-lg px-2 py-1 text-[13.5px] text-kp-text"
            />
            <button
              type="button"
              onClick={() => onChange({ ...slide, bullets: slide.bullets.filter((_, j) => j !== i) })}
              className="text-kp-text-faint hover:text-kp-bad text-[13px] px-1"
              title="Remove bullet"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...slide, bullets: [...slide.bullets, ""] })}
          className="text-[12.5px] font-semibold text-kp-text-muted hover:text-kp-navy pl-5"
        >
          + bullet
        </button>
      </div>
    </div>
  );
}

/* ── Question editor card ────────────────────────────────────────── */

function QuestionEditor({
  index,
  question,
  onSave,
  onDelete,
}: {
  index: number;
  question: KnowledgeQuestion;
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
          </div>
        </div>
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

/* ── Shared bits ─────────────────────────────────────────────────── */

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] uppercase text-kp-text-faint">{label}</span>
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="focus-kp mt-1 w-full bg-kp-surface border border-kp-border rounded-lg px-2.5 py-1.5 text-[13.5px] disabled:opacity-50"
      />
    </label>
  );
}

function SmallButton({
  children,
  onClick,
  tone,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "danger";
  disabled?: boolean;
}) {
  const cls =
    tone === "danger"
      ? "text-kp-bad border-kp-bad-border hover:bg-kp-bad-bg"
      : "text-kp-text-muted border-kp-border hover:bg-kp-surface-alt hover:text-kp-navy";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1.5 text-[12.5px] font-semibold border rounded-lg transition-colors disabled:opacity-30 ${cls}`}
    >
      {children}
    </button>
  );
}
