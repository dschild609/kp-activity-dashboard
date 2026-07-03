import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import type { AnswerKey, KnowledgeQuestion, KnowledgeTest } from "../types/knowledge";
import {
  attemptGate,
  getQuestions,
  getTest,
  gradeAnswers,
  listAttempts,
  submitAttempt,
  type GradeResult,
} from "../lib/knowledge";
import { SlideView, sectionNumberAt } from "../components/SlideView";

/* Per-attempt shuffle: question order is randomized, and MC options are
 * shown in random order with POSITIONAL display letters. Answers are
 * stored/graded by the ORIGINAL option key, so shuffling never touches
 * grading — it only stops answer keys from being shareable as "A, C, B…" */
interface QuizOrder {
  questions: KnowledgeQuestion[];
  optionOrder: Record<string, AnswerKey[]>;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuizOrder(questions: KnowledgeQuestion[]): QuizOrder {
  const optionOrder: Record<string, AnswerKey[]> = {};
  for (const q of questions) {
    const keys: AnswerKey[] = ["A", "B"];
    if (q.optionC) keys.push("C");
    if (q.optionD) keys.push("D");
    // True/False keeps its canonical order
    optionOrder[q.id] = q.type === "TF" ? keys : shuffle(keys);
  }
  return { questions: shuffle(questions), optionOrder };
}

type Blocked = "passed" | "single-used" | "out-of-attempts";

type PageState =
  | { phase: "loading" }
  | { phase: "blocked"; reason: Blocked; test: KnowledgeTest }
  | { phase: "error"; message: string }
  | { phase: "slides"; test: KnowledgeTest; quiz: QuizOrder; attemptNumber: number }
  | { phase: "taking"; test: KnowledgeTest; quiz: QuizOrder; attemptNumber: number }
  | { phase: "done"; test: KnowledgeTest; quiz: QuizOrder; result: GradeResult };

function slideProgressKey(uid: string, testId: string): string {
  return `kpk-slides-${uid}-${testId}`;
}

export function TakeTestPage({ preview = false }: { preview?: boolean }) {
  const { testId } = useParams<{ testId: string }>();
  const { user, canManage } = useOutletContext<AuthState>();
  const navigate = useNavigate();

  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [answers, setAnswers] = useState<Record<string, AnswerKey | null>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!testId || !user) return;
    (async () => {
      try {
        if (preview) {
          if (!canManage) {
            setState({ phase: "error", message: "Preview is admin-only." });
            return;
          }
          const test = await getTest(testId);
          if (!test) { setState({ phase: "error", message: "Test not found." }); return; }
          const questions = await getQuestions(testId);
          const quiz = buildQuizOrder(questions);
          setState({
            phase: test.slides.length > 0 ? "slides" : "taking",
            test,
            quiz,
            attemptNumber: 1,
          });
          return;
        }

        const [test, attempts] = await Promise.all([
          getTest(testId),
          listAttempts({ uid: user.uid, testId }),
        ]);
        if (!test || !test.isActive) {
          setState({ phase: "error", message: "Test not found or inactive." });
          return;
        }
        const gate = attemptGate(test, attempts);
        if (!gate.canTake) {
          setState({ phase: "blocked", reason: gate.reason!, test });
          return;
        }
        const questions = await getQuestions(testId);
        const quiz = buildQuizOrder(questions);
        setState({
          phase: test.slides.length > 0 ? "slides" : "taking",
          test,
          quiz,
          attemptNumber: attempts.length + 1,
        });
      } catch (e) {
        setState({ phase: "error", message: (e as Error).message });
      }
    })();
  }, [testId, user, preview, canManage]);

  const unanswered = useMemo(() => {
    if (state.phase !== "taking") return 0;
    return state.quiz.questions.filter((q) => !answers[q.id]).length;
  }, [state, answers]);

  async function handleSubmit() {
    if (state.phase !== "taking" || !user || submitting) return;
    setSubmitting(true);
    try {
      const result = gradeAnswers(state.quiz.questions, answers, state.test.maxWrongToPass);
      if (!preview) {
        await submitAttempt({
          uid: user.uid,
          userName: user.displayName ?? user.email ?? "Unknown",
          userEmail: user.email ?? "",
          test: state.test,
          result,
        });
        localStorage.removeItem(slideProgressKey(user.uid, state.test.id));
      }
      setState({ phase: "done", test: state.test, quiz: state.quiz, result });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setState({ phase: "error", message: `Submission failed: ${(e as Error).message}` });
    } finally {
      setSubmitting(false);
    }
  }

  if (state.phase === "loading") {
    return <Centered>Loading test…</Centered>;
  }
  if (state.phase === "error") {
    return (
      <Centered>
        <div className="text-kp-bad mb-4">{state.message}</div>
        <BackLink />
      </Centered>
    );
  }
  if (state.phase === "blocked") {
    const copy: Record<Blocked, { title: string; body: string }> = {
      passed: {
        title: "Already passed ✓",
        body: "You've passed this test — nothing more to do here.",
      },
      "single-used": {
        title: "Already completed",
        body: "This test allows one attempt. Ask your admin to reset it if you need a retake.",
      },
      "out-of-attempts": {
        title: "No attempts left",
        body: `You've used all ${state.test.maxAttempts} attempts. Ask your admin if you need another try.`,
      },
    };
    const c = copy[state.reason];
    return (
      <Centered>
        <div className="text-[15px] font-bold text-kp-text mb-1">{c.title}</div>
        <div className="text-kp-text-muted mb-4">{c.body}</div>
        <BackLink />
      </Centered>
    );
  }

  if (state.phase === "slides") {
    return (
      <SlideDeck
        test={state.test}
        preview={preview}
        progressKey={!preview && user ? slideProgressKey(user.uid, state.test.id) : null}
        onStartQuiz={() => {
          setState({ ...state, phase: "taking" });
          window.scrollTo({ top: 0 });
        }}
        onCancel={() => navigate(preview ? `/admin/tests/${testId}` : "/")}
      />
    );
  }

  const { test, quiz } = state;
  const result = state.phase === "done" ? state.result : null;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {preview && <PreviewBanner testId={test.id} />}
      <div className="mb-6">
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-kp-navy mb-1">
          {test.name}
        </h1>
        {test.description && (
          <p className="text-[14px] text-kp-text-muted">{test.description}</p>
        )}
        <div className="text-[12.5px] text-kp-text-faint mt-1">
          {quiz.questions.length} questions · up to {test.maxWrongToPass} wrong to pass
          {!preview && state.phase === "taking" && state.attemptNumber > 1 && (
            <>
              {" "}· attempt {state.attemptNumber}
              {test.retakePolicy === "limited" ? ` of ${test.maxAttempts}` : ""}
            </>
          )}
        </div>
      </div>

      {result && (
        <div
          className={`rounded-xl border p-5 mb-6 ${
            result.passed
              ? "bg-kp-good-bg border-kp-good-border"
              : "bg-kp-bad-bg border-kp-bad-border"
          }`}
        >
          <div className={`text-[18px] font-extrabold mb-1 ${result.passed ? "text-kp-good" : "text-kp-bad"}`}>
            {result.passed ? "✓ Passed" : "✗ Not passed"}
            {preview && <span className="font-semibold text-[13px]"> (preview — not saved)</span>}
          </div>
          <div className="text-[14px] text-kp-text">
            Score <strong>{result.score}%</strong> — {result.correctCount} of {result.totalCount} correct
            ({result.wrongCount} wrong, {test.maxWrongToPass} allowed).
          </div>
          {!preview && !result.passed && test.retakePolicy !== "single" && (
            <div className="text-[13px] text-kp-text-muted mt-1.5">
              You can review the material and retake the test from the Tests page.
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {quiz.questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            index={i}
            question={q}
            optionOrder={quiz.optionOrder[q.id]}
            given={answers[q.id] ?? null}
            graded={result ? result.graded[q.id] : null}
            onAnswer={(key) => setAnswers((prev) => ({ ...prev, [q.id]: key }))}
          />
        ))}
      </div>

      <div className="mt-8 flex items-center gap-4">
        {result ? (
          <Link
            to={preview ? `/admin/tests/${test.id}` : "/"}
            className="px-5 py-2.5 bg-kp-navy hover:bg-kp-navy-hover text-white text-[14px] font-semibold rounded-lg transition-colors"
          >
            {preview ? "Back to Editor" : "Back to Tests"}
          </Link>
        ) : (
          <>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2.5 bg-kp-crimson hover:bg-kp-crimson-hover text-white text-[14px] font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {submitting ? "Submitting…" : "Submit Test"}
            </button>
            {unanswered > 0 && (
              <span className="text-[13px] text-kp-text-muted">
                {unanswered} unanswered
              </span>
            )}
            <button
              type="button"
              onClick={() => navigate(preview ? `/admin/tests/${test.id}` : "/")}
              className="ml-auto px-4 py-2.5 text-[13.5px] font-semibold text-kp-text-muted hover:text-kp-navy border border-kp-border rounded-lg hover:bg-kp-surface transition-colors"
            >
              {preview ? "Exit Preview" : "Cancel"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

function PreviewBanner({ testId }: { testId: string }) {
  return (
    <div className="mb-5 flex items-center gap-3 text-[13px] font-semibold text-kp-violet bg-kp-crimson-soft border border-kp-border rounded-lg px-4 py-2.5">
      <span className="font-mono text-[10.5px] font-extrabold tracking-[0.06em] uppercase bg-kp-violet text-white px-1.5 py-0.5 rounded-[5px]">
        Preview
      </span>
      You're seeing this as an employee would — attempts aren't recorded.
      <Link to={`/admin/tests/${testId}`} className="ml-auto underline shrink-0">
        Back to editor
      </Link>
    </div>
  );
}

function QuestionCard({
  index,
  question,
  optionOrder,
  given,
  graded,
  onAnswer,
}: {
  index: number;
  question: KnowledgeQuestion;
  optionOrder: AnswerKey[];
  given: AnswerKey | null;
  graded: { given: AnswerKey | null; correct: AnswerKey; isCorrect: boolean } | null;
  onAnswer: (key: AnswerKey) => void;
}) {
  const labelFor: Record<AnswerKey, string | null> = {
    A: question.optionA,
    B: question.optionB,
    C: question.optionC,
    D: question.optionD,
  };
  // Options in display order; the letter shown is positional, the key is original
  const options = optionOrder
    .filter((k) => labelFor[k])
    .map((k, pos) => ({ key: k, label: labelFor[k]!, displayLetter: "ABCD"[pos] }));

  const railClass = graded
    ? graded.isCorrect
      ? "shadow-[inset_3px_0_0_var(--color-kp-good)]"
      : "shadow-[inset_3px_0_0_var(--color-kp-bad)]"
    : "shadow-2xs";

  return (
    <div className={`bg-kp-surface rounded-xl border border-kp-border p-5 ${railClass}`}>
      <div className="flex gap-3 mb-3">
        <span className="font-mono text-[11.5px] font-bold text-kp-text-faint mt-1">
          Q{index + 1}
        </span>
        <p className="text-[14.5px] font-semibold text-kp-text">{question.text}</p>
      </div>
      <div className="space-y-1.5 pl-8">
        {options.map((opt) => {
          let cls = "border-kp-border hover:border-kp-border-strong";
          if (graded) {
            if (opt.key === graded.correct) cls = "border-kp-good-border bg-kp-good-bg";
            else if (opt.key === graded.given && !graded.isCorrect) cls = "border-kp-bad-border bg-kp-bad-bg";
            else cls = "border-kp-border-soft opacity-60";
          } else if (given === opt.key) {
            cls = "border-kp-crimson bg-kp-crimson-soft";
          }
          return (
            <label
              key={opt.key}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-[14px] text-kp-text ${cls} ${graded ? "pointer-events-none" : ""}`}
            >
              <input
                type="radio"
                name={question.id}
                checked={given === opt.key}
                onChange={() => onAnswer(opt.key)}
                disabled={!!graded}
                className="accent-[var(--color-kp-crimson)]"
              />
              <span className="font-mono text-[11px] font-bold text-kp-text-faint">
                {opt.displayLetter}
              </span>
              {opt.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/* Training slides shown before the quiz. Progress persists per user (via
 * progressKey) so an interrupted session resumes on the same slide; the
 * quiz only unlocks from the last slide. Preview mode adds skip-ahead. */
function SlideDeck({
  test,
  preview,
  progressKey,
  onStartQuiz,
  onCancel,
}: {
  test: KnowledgeTest;
  preview: boolean;
  progressKey: string | null;
  onStartQuiz: () => void;
  onCancel: () => void;
}) {
  const slides = test.slides;
  const [index, setIndex] = useState(() => {
    if (!progressKey) return 0;
    const saved = Number(localStorage.getItem(progressKey) ?? 0);
    return Number.isInteger(saved) ? Math.max(0, Math.min(saved, slides.length - 1)) : 0;
  });
  const [resumed] = useState(index > 0);

  useEffect(() => {
    if (progressKey) localStorage.setItem(progressKey, String(index));
  }, [index, progressKey]);

  const slide = slides[index];
  const last = index === slides.length - 1;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {preview && <PreviewBanner testId={test.id} />}
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-kp-navy mb-1">
          {test.name}
        </h1>
        <p className="text-[13.5px] text-kp-text-muted">
          Review the material below — the quiz unlocks after the last slide.
          {resumed && !preview && (
            <span className="text-kp-crimson font-semibold"> Resuming where you left off.</span>
          )}
        </p>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[11px] font-bold tracking-[0.08em] uppercase text-kp-text-faint">
          Slide {index + 1} / {slides.length}
        </span>
        {preview && !last && (
          <button
            type="button"
            onClick={onStartQuiz}
            className="text-[12px] font-semibold text-kp-violet hover:underline"
          >
            Skip to quiz (preview) →
          </button>
        )}
      </div>
      <SlideView slide={slide} sectionNumber={sectionNumberAt(slides, index)} />
      <div className="h-1 bg-kp-surface-alt rounded-full mt-3 overflow-hidden">
        <div
          className="h-full bg-kp-crimson transition-all"
          style={{ width: `${((index + 1) / slides.length) * 100}%` }}
        />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="px-4 py-2.5 text-[13.5px] font-semibold text-kp-text border border-kp-border rounded-lg hover:bg-kp-surface transition-colors disabled:opacity-30"
        >
          ← Back
        </button>
        {last ? (
          <button
            type="button"
            onClick={onStartQuiz}
            className="px-5 py-2.5 bg-kp-crimson hover:bg-kp-crimson-hover text-white text-[14px] font-semibold rounded-lg transition-colors"
          >
            Start Quiz ({test.questionCount} questions)
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}
            className="px-5 py-2.5 bg-kp-navy hover:bg-kp-navy-hover text-white text-[14px] font-semibold rounded-lg transition-colors"
          >
            Next →
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto px-4 py-2.5 text-[13.5px] font-semibold text-kp-text-muted hover:text-kp-navy border border-kp-border rounded-lg hover:bg-kp-surface transition-colors"
        >
          {preview ? "Exit Preview" : "Exit"}
        </button>
      </div>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-center text-[14px] text-kp-text-muted">
      {children}
    </main>
  );
}

function BackLink() {
  return (
    <Link to="/" className="text-[13.5px] font-semibold text-kp-crimson hover:underline">
      ← Back to Tests
    </Link>
  );
}
