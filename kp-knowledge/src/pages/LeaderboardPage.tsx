import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import type { KnowledgeLeaderboardEntry } from "../types/knowledge";
import { listLeaderboard } from "../lib/knowledge";
import { NoticeBox, Th } from "../components/ui";

const RANK_BADGE = ["🥇", "🥈", "🥉"];

export function LeaderboardPage() {
  const { user } = useOutletContext<AuthState>();
  const [rows, setRows] = useState<KnowledgeLeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listLeaderboard(50)
      .then(setRows)
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-[24px] sm:text-[30px] font-extrabold tracking-[-0.025em] text-kp-navy mb-1">
        🏆 Asteroids Leaderboard
      </h1>
      <p className="text-[13px] text-kp-text-muted mb-6">
        Top arcade scores from across the team — play a test as Asteroids, clear the questions, and
        rack up bonus points to climb the ranks.
      </p>

      {error && (
        <NoticeBox tone="bad" className="mb-6">
          Couldn't load the leaderboard: {error}
        </NoticeBox>
      )}

      {rows === null && !error && (
        <div className="text-[14px] text-kp-text-muted">Loading…</div>
      )}

      {rows !== null && rows.length === 0 && (
        <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-10 text-center text-[14px] text-kp-text-muted">
          No scores yet — be the first to post one by playing a test as Asteroids.
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="bg-kp-surface-alt border-b border-kp-border-strong">
                <Th>Rank</Th>
                <Th>Player</Th>
                <Th align="right">Score</Th>
                <Th>Test</Th>
                <Th align="right">Set</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const me = user?.uid === r.uid;
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-kp-border-soft last:border-0 ${
                      me ? "shadow-[inset_3px_0_0_var(--color-kp-crimson)] bg-kp-crimson-soft/40" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-bold tabular-nums text-kp-text-muted w-16">
                      {RANK_BADGE[i] ?? `#${i + 1}`}
                    </td>
                    <td className="px-4 py-3 font-semibold text-kp-text">
                      {r.userName}
                      {me && (
                        <span className="ml-2 align-middle text-[10px] font-bold tracking-wide text-kp-crimson">
                          YOU
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-extrabold tabular-nums text-kp-navy">
                      {r.score.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-kp-text-muted">{r.testName}</td>
                    <td className="px-4 py-3 text-right text-kp-text-muted">
                      {r.updatedAt ? r.updatedAt.toDate().toLocaleDateString() : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
