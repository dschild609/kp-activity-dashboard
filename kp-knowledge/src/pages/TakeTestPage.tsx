import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import type { AnswerKey, KnowledgeQuestion, KnowledgeTest } from "../types/knowledge";
import {
  getQuestions,
  gradeAnswers,
  listAttempts,
  listTests,
  submitAttempt,
  type GradeResult,
} from "../lib/knowledge";

type PageState =
  | { phase: "loading" }
  | { phase: "already-taken" }
  | { phase: "error"; message: string }
  | { phase: "slides"; test: KnowledgeTest; questions: KnowledgeQuestion[] }
  | { phase: "taking"; test: KnowledgeTest; questions: KnowledgeQuestion[] }
  | { phase: "done"; test: KnowledgeTest; questions: KnowledgeQuestion[]; result: GradeResult };

export function TakeTestPage() {
  const { testId } = useParams<{ testId: string }>();
  const { user } = useOutletContext<AuthState>();
  const navigate = useNavigate();

  const [state, setState] = useState<PageState>({ phase: "loading" });
  const [answers, setAnswers] = useState<Record<string, AnswerKey | null>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!testId || !user) return;
    (async () => {
      try {
        const [tests, attempts] = await Promise.all([
          listTests({ activeOnly: true }),
          listAttempts({ uid: user.uid, testId }),
        ]);
        const test = tests.find((t) => t.id === testId);
        if (!test) { setState({ phase: "error", message: "Test not found or inactive." }); return; }
        if (attempts.length > 0) { setState({ phase: "already-taken" }); return; }
        const questions = await getQuestions(testId);
        setState({
          phase: test.slides.length > 0 ? "slides" : "taking",
          test,
          questions,
        });
      } catch (e) {
        setState({ phase: "error", message: (e as Error).message });
      }
    })();
  }, [testId, user]);

  const unanswered = useMemo(() => {
    if (state.phase !== "taking") return 0;
    return state.questions.filter((q) => !answers[q.id]).length;
  }, [state, answers]);

  async function handleSubmit() {
    if (state.phase !== "taking" || !user || submitting) return;
    setSubmitting(true);
    try {
      const result = gradeAnswers(state.questions, answers, state.test.maxWrongToPass);
      await submitAttempt({
        uid: user.uid,
        userName: user.displayName ?? user.email ?? "Unknown",
        userEmail: user.email ?? "",
        test: state.test,
        result,
      });
      setState({ phase: "done", test: state.test, questions: state.questions, result });
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
  if (state.phase === "already-taken") {
    return (
      <Centered>
        <div className="text-[15px] font-bold text-kp-text mb-1">Already completed</div>
        <div className="text-kp-text-muted mb-4">
          You've already taken this test. Ask your admin to reset your attempt if you
          need a retake.
        </div>
        <BackLink />
      </Centered>
    );
  }

  if (state.phase === "slides") {
    return (
      <SlideDeck
        test={state.test}
        onStartQuiz={() => {
          setState({ phase: "taking", test: state.test, questions: state.questions });
          window.scrollTo({ top: 0 });
        }}
        onCancel={() => navigate("/")}
      />
    );
  }

  const { test, questions } = state;
  const result = state.phase === "done" ? state.result : null;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-kp-navy mb-1">
          {test.name}
        </h1>
        {test.description && (
          <p className="text-[14px] text-kp-text-muted">{test.description}</p>
        )}
        <div className="text-[12.5px] text-kp-text-faint mt-1">
          {questions.length} questions · up to {test.maxWrongToPass} wrong to pass
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
          </div>
          <div className="text-[14px] text-kp-text">
            Score <strong>{result.score}%</strong> — {result.correctCount} of {result.totalCount} correct
            ({result.wrongCount} wrong, {test.maxWrongToPass} allowed).
          </div>
        </div>
      )}

      <div className="space-y-4">
        {questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            index={i}
            question={q}
            given={answers[q.id] ?? null}
            graded={result ? result.graded[q.id] : null}
            onAnswer={(key) => setAnswers((prev) => ({ ...prev, [q.id]: key }))}
          />
        ))}
      </div>

      <div className="mt-8 flex items-center gap-4">
        {result ? (
          <Link
            to="/"
            className="px-5 py-2.5 bg-kp-navy hover:bg-kp-navy-hover text-white text-[14px] font-semibold rounded-lg transition-colors"
          >
            Back to Tests
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
              onClick={() => navigate("/")}
              className="ml-auto px-4 py-2.5 text-[13.5px] font-semibold text-kp-text-muted hover:text-kp-navy border border-kp-border rounded-lg hover:bg-kp-surface transition-colors"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </main>
  );
}

function QuestionCard({
  index,
  question,
  given,
  graded,
  onAnswer,
}: {
  index: number;
  question: KnowledgeQuestion;
  given: AnswerKey | null;
  graded: { given: AnswerKey | null; correct: AnswerKey; isCorrect: boolean } | null;
  onAnswer: (key: AnswerKey) => void;
}) {
  const options: Array<{ key: AnswerKey; label: string }> = [
    { key: "A" as const, label: question.optionA },
    { key: "B" as const, label: question.optionB },
    ...(question.optionC ? [{ key: "C" as const, label: question.optionC }] : []),
    ...(question.optionD ? [{ key: "D" as const, label: question.optionD }] : []),
  ];

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
                className="accent-[#94002a]"
              />
              <span className="font-mono text-[11px] font-bold text-kp-text-faint">{opt.key}</span>
              {opt.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/* Training slides shown before the quiz — one KP-branded card per slide,
 * chrome header band, crimson progress, Back/Next navigation. */
function SlideDeck({
  test,
  onStartQuiz,
  onCancel,
}: {
  test: KnowledgeTest;
  onStartQuiz: () => void;
  onCancel: () => void;
}) {
  const [index, setIndex] = useState(0);
  const slides = test.slides;
  const slide = slides[index];
  const last = index === slides.length - 1;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-kp-navy mb-1">
          {test.name}
        </h1>
        <p className="text-[13.5px] text-kp-text-muted">
          Review the material below — the quiz comes after the last slide.
        </p>
      </div>

      <div className="bg-kp-surface rounded-xl border border-kp-border shadow-2xs overflow-hidden">
        <div className="bg-kp-chrome border-l-4 border-kp-crimson px-5 py-3.5 flex items-center justify-between">
          <span className="text-white text-[16px] font-bold">{slide.title}</span>
          <span className="font-mono text-[11px] font-bold tracking-[0.08em] uppercase text-white/50">
            Slide {index + 1} / {slides.length}
          </span>
        </div>
        <ul className="px-6 py-6 space-y-3 min-h-[220px]">
          {slide.bullets.map((b, i) => (
            <li key={i} className="flex gap-3 text-[15px] text-kp-text leading-relaxed">
              <span className="text-kp-crimson font-bold mt-0.5">•</span>
              {b}
            </li>
          ))}
        </ul>
        <div className="h-1 bg-kp-surface-alt">
          <div
            className="h-full bg-kp-crimson transition-all"
            style={{ width: `${((index + 1) / slides.length) * 100}%` }}
          />
        </div>
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
          Exit
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
