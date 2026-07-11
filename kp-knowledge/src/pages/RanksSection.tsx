// The training-rank ladder — a Halo 3-style leaderboard for tests. EXP =
// passing attempts, Skill = avg best score ÷ 2 (1–50), and rank requires both.

import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AuthState } from "../hooks/useAuth";
import type { KnowledgeRankRecord } from "../types/knowledge";
import { listRanks } from "../lib/knowledge";
import { RANKS, rankIndexOf, rankName } from "../lib/ranks";
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
        Every passed test earns EXP, and your average best score sets your <b>skill</b> (1–50).
        Climbing the ladder takes both — grind alone and you'll stall in the enlisted ranks;
        the officer grades demand scores.
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
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-kp-border-soft last:border-0 ${
                      me ? "shadow-[inset_3px_0_0_var(--color-kp-crimson)] bg-kp-crimson-soft/40" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 font-semibold text-kp-text whitespace-nowrap">
                        <RankBadge rankIndex={r.rankIndex} />
                        {rankName(r.rankIndex)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-kp-text">
                      {r.userName}
                      {me && (
                        <span className="ml-2 align-middle text-[10px] font-bold tracking-wide text-kp-crimson">
                          YOU
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <SkillShield skill={r.skill} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums text-kp-navy">{r.passes}</td>
                    <td className="px-4 py-2.5 text-right text-kp-text-muted tabular-nums">
                      {r.avgBest.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* The full ladder, Halo 3 style — what it takes to reach each rank. */}
      <h2 className="kp-kicker mt-8 mb-3">The Ladder</h2>
      <div className="bg-kp-surface border border-kp-border rounded-xl shadow-2xs p-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {RANKS.map((rk, i) => (
          <div key={rk.id} className="flex items-center gap-2.5">
            <RankBadge rankIndex={i} size={24} />
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-kp-text leading-tight">{rk.name}</div>
              <div className="text-[11.5px] text-kp-text-faint leading-tight">
                {rk.passes === 0 && rk.skill === 0
                  ? "Report for duty"
                  : `${rk.passes} pass${rk.passes === 1 ? "" : "es"}${rk.skill > 0 ? ` · skill ${rk.skill}` : ""}`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
