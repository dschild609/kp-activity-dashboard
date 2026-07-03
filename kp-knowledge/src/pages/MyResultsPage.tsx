import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import type { KnowledgeAttempt } from "../types/knowledge";
import { listAttempts } from "../lib/knowledge";
import { Pill, Th } from "../components/ui";

export function MyResultsPage() {
  const { user } = useOutletContext<AuthState>();
  const [attempts, setAttempts] = useState<KnowledgeAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    listAttempts({ uid: user.uid })
      .then(setAttempts)
      .catch((e) => setError((e as Error).message));
  }, [user]);

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-[30px] font-extrabold tracking-[-0.025em] text-kp-navy mb-6">
        My Results
      </h1>

      {error && (
        <div className="text-[13px] text-kp-bad bg-kp-bad-bg border border-kp-bad-border rounded-lg p-4 mb-6">
          Couldn't load results: {error}
        </div>
      )}

      {attempts === null && !error && (
        <div className="text-[14px] text-kp-text-muted">Loading…</div>
      )}

      {attempts !== null && attempts.length === 0 && (
        <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-10 text-center text-[14px] text-kp-text-muted">
          You haven't taken any tests yet.
        </div>
      )}

      {attempts !== null && attempts.length > 0 && (
        <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="bg-kp-surface-alt border-b border-kp-border-strong">
                <Th>Test</Th>
                <Th>Result</Th>
                <Th align="right">Score</Th>
                <Th align="right">Correct</Th>
                <Th align="right">Date</Th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr
                  key={a.id}
                  className={`border-b border-kp-border-soft last:border-0 ${
                    a.passed
                      ? "shadow-[inset_3px_0_0_var(--color-kp-good)]"
                      : "shadow-[inset_3px_0_0_var(--color-kp-bad)]"
                  }`}
                >
                  <td className="px-4 py-3 font-semibold text-kp-text">{a.testName}</td>
                  <td className="px-4 py-3">
                    <Pill tone={a.passed ? "good" : "bad"}>{a.passed ? "Passed" : "Failed"}</Pill>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">{a.score}%</td>
                  <td className="px-4 py-3 text-right text-kp-text-muted">
                    {a.correctCount}/{a.totalCount}
                  </td>
                  <td className="px-4 py-3 text-right text-kp-text-muted">
                    {a.submittedAt ? a.submittedAt.toDate().toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

