import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import type { KnowledgeAttempt, KnowledgeTest } from "../types/knowledge";
import { attemptGate, listAttempts, listTests } from "../lib/knowledge";

export function TestsPage() {
  const { user } = useOutletContext<AuthState>();
  const [tests, setTests] = useState<KnowledgeTest[] | null>(null);
  const [attempts, setAttempts] = useState<KnowledgeAttempt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([listTests({ activeOnly: true }), listAttempts({ uid: user.uid })])
      .then(([t, a]) => { setTests(t); setAttempts(a); })
      .catch((e) => setError((e as Error).message));
  }, [user]);

  const attemptsByTest = useMemo(() => {
    const map = new Map<string, KnowledgeAttempt[]>();
    for (const a of attempts) {
      const list = map.get(a.testId) ?? [];
      list.push(a);
      map.set(a.testId, list);
    }
    return map;
  }, [attempts]);

  const allTags = useMemo(
    () => [...new Set((tests ?? []).flatMap((t) => t.tags))].sort(),
    [tests]
  );

  const visible = (tests ?? []).filter((t) => !tagFilter || t.tags.includes(tagFilter));

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-[30px] font-extrabold tracking-[-0.025em] text-kp-navy mb-1">
        Tests
      </h1>
      <p className="text-[14px] text-kp-text-muted mb-6">
        Certification and knowledge checks assigned to KP staff.
      </p>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <FilterChip label="All" active={tagFilter === null} onClick={() => setTagFilter(null)} />
          {allTags.map((tag) => (
            <FilterChip key={tag} label={tag} active={tagFilter === tag} onClick={() => setTagFilter(tag)} />
          ))}
        </div>
      )}

      {error && (
        <div className="text-[13px] text-kp-bad bg-kp-bad-bg border border-kp-bad-border rounded-lg p-4 mb-6">
          Couldn't load tests: {error}
        </div>
      )}

      {tests === null && !error && (
        <div className="text-[14px] text-kp-text-muted">Loading tests…</div>
      )}

      {tests !== null && visible.length === 0 && (
        <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-10 text-center">
          <div className="text-[28px] mb-2">📚</div>
          <div className="text-[15px] font-bold text-kp-text mb-1">No tests available</div>
          <div className="text-[13.5px] text-kp-text-muted">
            When tests are published they'll show up here.
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {visible.map((test) => {
          const testAttempts = attemptsByTest.get(test.id) ?? [];
          const best = testAttempts.find((a) => a.passed) ?? testAttempts[0];
          const gate = attemptGate(test, testAttempts);
          const passNeeded = Math.max(test.questionCount - test.maxWrongToPass, 0);
          return (
            <div
              key={test.id}
              className="group flex flex-col p-5 bg-kp-surface rounded-xl border border-kp-border shadow-2xs hover:border-kp-border-strong hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h2 className="text-[16px] font-bold text-kp-text">{test.name}</h2>
                {best ? (
                  best.passed ? (
                    <Pill tone="good">Passed</Pill>
                  ) : (
                    <Pill tone="bad">Failed</Pill>
                  )
                ) : (
                  <Pill tone="neutral">Not started</Pill>
                )}
              </div>
              {test.description && (
                <p className="text-[13.5px] text-kp-text-muted mb-3">{test.description}</p>
              )}
              <div className="text-[12.5px] text-kp-text-faint mb-4">
                {test.questionCount} questions · pass with {passNeeded} or more correct
              </div>
              <div className="mt-auto space-y-2.5">
                {best && (
                  <div className="text-[13.5px] font-semibold text-kp-text-muted">
                    {best.passed ? "Score" : "Best so far"}:{" "}
                    <span className="font-bold text-kp-text">
                      {Math.max(...testAttempts.map((a) => a.score))}%
                    </span>
                    {best.submittedAt && (
                      <span className="text-kp-text-faint font-normal">
                        {" "}· {best.submittedAt.toDate().toLocaleDateString()}
                      </span>
                    )}
                    {testAttempts.length > 1 && (
                      <span className="text-kp-text-faint font-normal">
                        {" "}· {testAttempts.length} attempts
                      </span>
                    )}
                  </div>
                )}
                {gate.canTake && (
                  <Link
                    to={`/tests/${test.id}`}
                    className={`inline-block px-4 py-2 text-white text-[13.5px] font-semibold rounded-lg transition-colors ${
                      best ? "bg-kp-crimson hover:bg-kp-crimson-hover" : "bg-kp-navy hover:bg-kp-navy-hover"
                    }`}
                  >
                    {best
                      ? `Retake Test${
                          test.retakePolicy === "limited"
                            ? ` (${testAttempts.length} of ${test.maxAttempts} used)`
                            : ""
                        }`
                      : "Start Test"}
                  </Link>
                )}
                {!gate.canTake && gate.reason === "out-of-attempts" && (
                  <div className="text-[12.5px] text-kp-text-faint">
                    All {test.maxAttempts} attempts used — ask your admin for another.
                  </div>
                )}
                {!gate.canTake && gate.reason === "single-used" && !best?.passed && (
                  <div className="text-[12.5px] text-kp-text-faint">
                    One attempt allowed — ask your admin for a reset.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const cls = active
    ? label === "All"
      ? "bg-kp-navy text-white border-kp-navy"
      : "bg-kp-crimson-soft text-kp-crimson-soft-text border-kp-crimson-soft"
    : "bg-kp-surface text-kp-text-muted border-kp-border hover:border-kp-border-strong";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${cls}`}
    >
      {label}
    </button>
  );
}

export function Pill({ tone, children }: { tone: "good" | "bad" | "warn" | "neutral"; children: React.ReactNode }) {
  const cls = {
    good: "text-kp-good bg-kp-good-bg border-kp-good-border",
    bad: "text-kp-bad bg-kp-bad-bg border-kp-bad-border",
    warn: "text-kp-warn bg-kp-warn-bg border-kp-warn-border",
    neutral: "text-kp-text-muted bg-kp-surface-alt border-kp-border",
  }[tone];
  return (
    <span className={`shrink-0 px-2 py-0.5 text-[12.5px] font-bold rounded-[6px] border ${cls}`}>
      {children}
    </span>
  );
}
