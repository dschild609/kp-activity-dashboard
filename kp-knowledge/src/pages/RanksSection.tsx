// The training-rank ladder — a Halo 3-style leaderboard for tests. EXP =
// passing attempts, Skill = avg best score ÷ 2 (1–50), and every one of the
// 42 mastery ranks (Recruit → Five Star General) gates on both.

import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import type { KnowledgeRankRecord } from "../types/knowledge";
import { listRanks } from "../lib/knowledge";
import { RANKS, rankIndexOf, type RankGroup } from "../lib/ranks";
import { RankBadge, SkillShield } from "../components/RankBadge";
import { NoticeBox, Th } from "../components/ui";

export function RanksSection() {
  const { user } = useOutletContext<AuthState>();
  const [rows, setRows] = useState<KnowledgeRankRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRanks(200)
      .then(setRows)
      .catch((e) => setError((e as Error).message));
  }, []);

  const ranked = (rows ?? [])
    .map((r) => ({ ...r, rankIndex: rankIndexOf(r.passes, r.skill) }))
    .sort(
      (a, b) =>
        b.rankIndex - a.rankIndex ||
        b.skill - a.skill ||
        b.passes - a.passes ||
        b.avgBest - a.avgBest ||
        a.userName.localeCompare(b.userName),
    );

  return (
    <>
      <p className="text-[13px] text-kp-text-muted mb-6">
        Every passed test earns EXP, and your <b>skill</b> (1–50) grows with each win — every pass
        pulls it toward half that test's score, so the legendary 50 takes dozens of near-perfect
        wins. Climbing the 42 mastery ranks takes both — grind alone and you'll stall in the
        enlisted grades; the officer ladder demands scores.
      </p>

      {error && (
        <NoticeBox tone="bad" className="mb-6">
          Couldn't load the ranks: {error}
        </NoticeBox>
      )}

      {rows === null && !error && <div className="text-[14px] text-kp-text-muted">Loading…</div>}

      {rows !== null && ranked.length === 0 && (
        <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-10 text-center text-[14px] text-kp-text-muted">
          No ranks yet — pass a test to enlist.
        </div>
      )}

      {ranked.length > 0 && (
        <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="bg-kp-surface-alt border-b border-kp-border-strong">
                <Th>Rank</Th>
                <Th>Player</Th>
                <Th align="right">Skill</Th>
                <Th align="right">Passes</Th>
                <Th align="right">Avg best</Th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => {
                const me = user?.uid === r.uid;
                const rk = RANKS[r.rankIndex];
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-kp-border-soft last:border-0 ${
                      me ? "shadow-[inset_3px_0_0_var(--color-kp-crimson)] bg-kp-crimson-soft/40" : ""
                    }`}
                  >
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2.5 whitespace-nowrap">
                        <RankBadge rankIndex={r.rankIndex} size={36} />
                        <span className="leading-tight">
                          <span className="block font-semibold text-kp-text">{rk.name}</span>
                          {rk.sub && (
                            <span className="block font-mono text-[9.5px] uppercase tracking-[0.14em] text-kp-text-faint">
                              {rk.sub}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2 font-semibold text-kp-text">
                      {r.userName}
                      {me && (
                        <span className="ml-2 align-middle text-[10px] font-bold tracking-wide text-kp-crimson">
                          YOU
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <SkillShield skill={r.skill} />
                    </td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums text-kp-navy">{r.passes}</td>
                    <td className="px-4 py-2 text-right text-kp-text-muted tabular-nums">
                      {r.avgBest.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* The full 42-rank ladder, grouped like the insignia chart. */}
      {(["Enlisted", "Officer"] as RankGroup[]).map((group) => (
        <div key={group}>
          <h2 className="kp-kicker mt-8 mb-3">{group} ranks</h2>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))" }}>
            {RANKS.map((rk, i) => ({ rk, i }))
              .filter(({ rk }) => rk.group === group)
              .map(({ rk, i }) => (
                <div
                  key={rk.id}
                  className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs px-2 py-3 flex flex-col items-center text-center"
                >
                  <RankBadge rankIndex={i} size={58} />
                  <div className="mt-1.5 text-[12px] font-bold text-kp-text leading-tight">{rk.name}</div>
                  {rk.sub && (
                    <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-kp-text-faint mt-0.5">
                      {rk.sub}
                    </div>
                  )}
                  <div className="text-[10.5px] text-kp-text-faint leading-tight mt-1">
                    {rk.passes === 0
                      ? "Report for duty"
                      : `${rk.passes} pass${rk.passes === 1 ? "" : "es"}${rk.skill > 0 ? ` · skill ${rk.skill}` : ""}`}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </>
  );
}
