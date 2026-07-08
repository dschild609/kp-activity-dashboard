import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import type { AnswerKey, KnowledgeQuestion, KnowledgeSlide, KnowledgeTest } from "../types/knowledge";
import {
  attemptGate,
  getQuestions,
  getTest,
  gradeAnswers,
  listAttempts,
  recordOpen,
  submitAttempt,
  submitHighScore,
  type GradeResult,
} from "../lib/knowledge";
import { SlideView, sectionNumberAt } from "../components/SlideView";
import { VideoPlayer } from "../components/VideoPlayer";
import { AsteroidsQuiz } from "../components/AsteroidsQuiz";
import { parseVideoUrl } from "../lib/video";

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
  | { phase: "game"; test: KnowledgeTest; quiz: QuizOrder; attemptNumber: number }
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
        void recordOpen(testId, user.uid); // best-effort "opened" timestamp
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

  async function submitAnswers(finalAnswers: Record<string, AnswerKey | null>) {
    if ((state.phase !== "taking" && state.phase !== "game") || !user || submitting) return;
    setSubmitting(true);
    try {
      const result = gradeAnswers(state.quiz.questions, finalAnswers, state.test.maxWrongToPass);
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
  const handleSubmit = () => submitAnswers(answers);

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
    const gstate = state;
    return (
      <SlideDeck
        test={state.test}
        preview={preview}
        progressKey={!preview && user ? slideProgressKey(user.uid, state.test.id) : null}
        onStartQuiz={() => {
          setState({ ...gstate, phase: "taking" });
          window.scrollTo({ top: 0 });
        }}
        onStartGame={() => {
          setState({ ...gstate, phase: "game" });
          window.scrollTo({ top: 0 });
        }}
        onCancel={() => navigate(preview ? `/admin/tests/${testId}` : "/")}
      />
    );
  }

  if (state.phase === "game") {
    const gstate = state;
    return (
      <AsteroidsQuiz
        test={state.test}
        quiz={state.quiz}
        onComplete={(a) => submitAnswers(a)}
        onScore={(score) => {
          // Record the arcade run on the global leaderboard (not in preview).
          if (!preview && user) {
            submitHighScore({
              uid: user.uid,
              userName: user.displayName ?? user.email ?? "Unknown",
              score,
              test: gstate.test,
            });
          }
        }}
        onFallback={(a) => {
          setAnswers(a);
          setState({ ...gstate, phase: "taking" });
          window.scrollTo({ top: 0 });
        }}
        onExit={() => navigate(preview ? `/admin/tests/${testId}` : "/")}
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
        {state.phase === "taking" && (
          <button
            type="button"
            onClick={() => setState({ ...state, phase: "game" })}
            className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-kp-crimson hover:underline"
          >
            🎮 Play as Asteroids instead
          </button>
        )}
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

      <div className="mt-8 flex flex-wrap items-center gap-3">
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

/* Renders a slide at its fixed design size (16:9) and scales it to fit the
 * container width. On desktop (container ~1024px) scale ≈ 1, identical to
 * before; on a phone the whole slide shrinks to fit instead of overflowing
 * and being clipped. Isolated from the editor's own filmstrip scaling. */
const SLIDE_DESIGN_W = 1024;
function ScaledSlide({ slide, sectionNumber }: { slide: KnowledgeSlide; sectionNumber: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // useLayoutEffect measures before paint, so the slide never flashes at full
  // design width (which would briefly overflow a narrow screen).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / SLIDE_DESIGN_W);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative w-full overflow-hidden" style={{ aspectRatio: "16 / 9" }}>
      <div
        className="absolute top-0 left-0"
        style={{ width: SLIDE_DESIGN_W, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        <SlideView slide={slide} sectionNumber={sectionNumber} />
      </div>
    </div>
  );
}

/* Employee rendering of a video slide — a responsive, full-width player
 * (not the fixed-scale ScaledSlide, so the video stays large on mobile).
 * Uploaded files auto-mark watched on end; embeds get a confirm button. */
function VideoSlidePlayer({
  slide,
  gate,
  watched,
  onWatched,
}: {
  slide: KnowledgeSlide;
  gate: boolean;
  watched: boolean;
  onWatched: () => void;
}) {
  const v = slide.videoUrl ? parseVideoUrl(slide.videoUrl) : null;
  return (
    <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-5 sm:p-6">
      {slide.kicker && (
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-kp-crimson mb-1.5">
          {slide.kicker}
        </div>
      )}
      {slide.title && (
        <h2 className="text-[18px] sm:text-[22px] font-extrabold tracking-[-0.02em] text-kp-navy mb-4">
          {slide.title}
        </h2>
      )}
      {slide.videoUrl ? (
        <VideoPlayer url={slide.videoUrl} onEnded={onWatched} />
      ) : (
        <div className="aspect-video bg-kp-surface-alt rounded-lg flex items-center justify-center text-[13px] text-kp-text-faint">
          No video on this slide yet.
        </div>
      )}
      {slide.body && <p className="text-[14px] text-kp-text-muted mt-4">{slide.body}</p>}
      {gate && slide.videoUrl && !watched && v?.isEmbed && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onWatched}
            className="px-4 py-2 bg-kp-navy hover:bg-kp-navy-hover text-white text-[13.5px] font-semibold rounded-lg"
          >
            I've finished watching
          </button>
          <span className="text-[12.5px] text-kp-text-faint">Continue once you've watched the video.</span>
        </div>
      )}
      {gate && slide.videoUrl && !watched && !v?.isEmbed && (
        <div className="mt-3 text-[12.5px] text-kp-text-faint">Finish the video to continue.</div>
      )}
      {gate && watched && (
        <div className="mt-3 text-[12.5px] font-semibold text-kp-good">✓ Watched</div>
      )}
    </div>
  );
}

function PreviewBanner({ testId }: { testId: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold text-kp-violet bg-kp-crimson-soft border border-kp-border rounded-lg px-4 py-2.5">
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
  onStartGame,
  onCancel,
}: {
  test: KnowledgeTest;
  preview: boolean;
  progressKey: string | null;
  onStartQuiz: () => void;
  onStartGame: () => void;
  onCancel: () => void;
}) {
  const slides = test.slides;
  const [index, setIndex] = useState(() => {
    if (!progressKey) return 0;
    const saved = Number(localStorage.getItem(progressKey) ?? 0);
    return Number.isInteger(saved) ? Math.max(0, Math.min(saved, slides.length - 1)) : 0;
  });
  const [resumed] = useState(index > 0);

  // Which video slides this user has already watched (persisted, so a retake
  // or a resumed session doesn't force a re-watch). Not gated in preview.
  const watchedKey = progressKey ? `${progressKey}-watched` : null;
  const [watched, setWatched] = useState<Set<number>>(() => {
    if (!watchedKey) return new Set();
    try {
      return new Set<number>(JSON.parse(localStorage.getItem(watchedKey) ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const markWatched = (i: number) =>
    setWatched((prev) => {
      if (prev.has(i)) return prev;
      const next = new Set(prev).add(i);
      if (watchedKey) localStorage.setItem(watchedKey, JSON.stringify([...next]));
      return next;
    });

  useEffect(() => {
    if (progressKey) localStorage.setItem(progressKey, String(index));
  }, [index, progressKey]);

  const slide = slides[index];
  const last = index === slides.length - 1;
  // Lock advancing off a video slide until it's been watched the first time.
  const videoNeedsWatch =
    !preview && slide.kind === "video" && !!slide.videoUrl && !watched.has(index);

  // Fullscreen "present mode" for the slide stage. Arrow keys navigate while
  // fullscreen; the backdrop uses the app bg so the controls stay readable.
  // Hidden where the Fullscreen API isn't available (e.g. iOS Safari).
  const fsRef = useRef<HTMLDivElement>(null);
  const [isFs, setIsFs] = useState(false);
  const fsSupported = typeof document !== "undefined" && document.fullscreenEnabled;
  useEffect(() => {
    const onChange = () => setIsFs(document.fullscreenElement === fsRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void fsRef.current?.requestFullscreen?.();
  };
  useEffect(() => {
    if (!isFs) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && !last && !videoNeedsWatch) setIndex((i) => Math.min(slides.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFs, last, videoNeedsWatch, slides.length]);

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
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

      <div
        ref={fsRef}
        className={isFs ? "fixed inset-0 z-50 bg-kp-bg overflow-y-auto flex flex-col px-4 sm:px-8 py-5" : undefined}
      >
      <div
        className={isFs ? "mx-auto my-auto w-full" : undefined}
        style={isFs ? { maxWidth: "calc((100vh - 170px) * 16 / 9)" } : undefined}
      >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="font-mono text-[11px] font-bold tracking-[0.08em] uppercase text-kp-text-faint">
          Slide {index + 1} / {slides.length}
        </span>
        <div className="flex items-center gap-3">
          {preview && !last && (
            <button
              type="button"
              onClick={onStartQuiz}
              className="text-[12px] font-semibold text-kp-violet hover:underline"
            >
              Skip to quiz (preview) →
            </button>
          )}
          {fsSupported && (
            <button
              type="button"
              onClick={toggleFs}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-kp-text-muted hover:text-kp-navy"
              title={isFs ? "Exit full screen (Esc)" : "Full screen"}
            >
              {isFs ? "⤢ Exit full screen" : "⛶ Full screen"}
            </button>
          )}
        </div>
      </div>
      {slide.kind === "video" ? (
        <VideoSlidePlayer
          slide={slide}
          gate={!preview}
          watched={watched.has(index)}
          onWatched={() => markWatched(index)}
        />
      ) : (
        <ScaledSlide slide={slide} sectionNumber={sectionNumberAt(slides, index)} />
      )}
      <div className="h-1 bg-kp-surface-alt rounded-full mt-3 overflow-hidden">
        <div
          className="h-full bg-kp-crimson transition-all"
          style={{ width: `${((index + 1) / slides.length) * 100}%` }}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="px-4 py-2.5 text-[13.5px] font-semibold text-kp-text border border-kp-border rounded-lg hover:bg-kp-surface transition-colors disabled:opacity-30"
        >
          ← Back
        </button>
        {last ? (
          <>
          <button
            type="button"
            onClick={onStartQuiz}
            disabled={videoNeedsWatch}
            className="px-5 py-2.5 bg-kp-crimson hover:bg-kp-crimson-hover text-white text-[14px] font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start Quiz ({test.questionCount} questions)
          </button>
          <button
            type="button"
            onClick={onStartGame}
            disabled={videoNeedsWatch}
            title="Answer by playing Asteroids"
            className="px-4 py-2.5 bg-kp-navy hover:bg-kp-navy-hover text-white text-[14px] font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            🎮 Asteroids Quiz
          </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}
            disabled={videoNeedsWatch}
            className="px-5 py-2.5 bg-kp-navy hover:bg-kp-navy-hover text-white text-[14px] font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
      </div>
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
