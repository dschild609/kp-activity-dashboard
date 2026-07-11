// Halo 3-style training ranks — the full 42-step mastery ladder from the
// "Rank Insignia" spec: every rank family has Grades (2–4 steps), enlisted
// wear bronze/gold, officers silver, and each family's Grade 4 is a named
// capstone (Master Sergeant, First Lieutenant, … Five Star General).
//
// EXP = passing attempts ("battles won" — practice retakes count), Skill =
// your average best score across the tests you've taken, mapped onto Halo's
// 1–50 scale (a perfect 100% average is the legendary 50). Ranks gate on
// BOTH, exactly like Halo 3's dual EXP + Highest Skill requirements —
// grinding attempts alone stalls you in the enlisted ranks; the officer
// ladder demands scores. Grades within a family are pure EXP.

export type RankSymbol = "diamond" | "chevron" | "bar" | "star" | "wings" | "laurel";
export type RankMetal = "bronze" | "gold" | "silver";
export type RankGroup = "Enlisted" | "Officer";

export interface RankDef {
  id: string;
  /* Display name — the family name, or the Grade 4 capstone's own name */
  name: string;
  /* "Grade 2" … "Grade 4"; null on a family's first step */
  sub: string | null;
  group: RankGroup;
  /* Emblem recipe (see RankBadge) */
  symbol: RankSymbol;
  count: number;
  grade: number;
  capstone: boolean;
  metal: RankMetal;
  /* Requirements */
  passes: number;
  skill: number;
}

interface GradeStep {
  passes: number;
  label?: string;
  capstone?: boolean;
  /* laurel emblems vary star count per grade instead of grade bars */
  count?: number;
}

const ladder: RankDef[] = [];

function fam(
  name: string,
  group: RankGroup,
  symbol: RankSymbol,
  count: number,
  metal: RankMetal,
  skill: number,
  grades: GradeStep[],
): void {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  grades.forEach((g, i) => {
    ladder.push({
      id: `${slug}-${i + 1}`,
      name: g.label ?? name,
      sub: i === 0 ? null : `Grade ${i + 1}`,
      group,
      symbol,
      count: g.count ?? count,
      grade: i + 1,
      capstone: !!g.capstone,
      metal,
      passes: g.passes,
      skill,
    });
  });
}

/* ── Enlisted ─────────────────────────────────────────────────────── */
fam("Recruit", "Enlisted", "diamond", 1, "bronze", 0, [{ passes: 0 }]);
fam("Apprentice", "Enlisted", "diamond", 1, "bronze", 0, [{ passes: 1 }, { passes: 2 }]);
fam("Private", "Enlisted", "chevron", 1, "gold", 5, [{ passes: 3 }, { passes: 4 }]);
fam("Corporal", "Enlisted", "chevron", 2, "gold", 12, [{ passes: 5 }, { passes: 6 }]);
fam("Sergeant", "Enlisted", "chevron", 3, "gold", 18, [
  { passes: 7 }, { passes: 8 }, { passes: 9 },
]);
fam("Gunnery Sergeant", "Enlisted", "chevron", 3, "gold", 24, [
  { passes: 10 }, { passes: 12 }, { passes: 14 },
  { passes: 16, label: "Master Sergeant", capstone: true },
]);

/* ── Officer ──────────────────────────────────────────────────────── */
fam("Lieutenant", "Officer", "bar", 1, "silver", 28, [
  { passes: 18 }, { passes: 20 }, { passes: 22 },
  { passes: 24, label: "First Lieutenant", capstone: true },
]);
fam("Captain", "Officer", "bar", 2, "silver", 32, [
  { passes: 26 }, { passes: 28 }, { passes: 30 },
  { passes: 32, label: "Staff Captain", capstone: true },
]);
fam("Major", "Officer", "star", 1, "silver", 36, [
  { passes: 34 }, { passes: 36 }, { passes: 38 },
  { passes: 40, label: "Field Major", capstone: true },
]);
fam("Commander", "Officer", "star", 2, "silver", 40, [
  { passes: 43 }, { passes: 46 }, { passes: 49 },
  { passes: 52, label: "Strike Commander", capstone: true },
]);
fam("Colonel", "Officer", "star", 3, "silver", 43, [
  { passes: 55 }, { passes: 58 }, { passes: 61 },
  { passes: 64, label: "Force Colonel", capstone: true },
]);
fam("Brigadier", "Officer", "wings", 1, "silver", 46, [
  { passes: 68 }, { passes: 72 }, { passes: 76 },
  { passes: 80, label: "Brigadier General", capstone: true },
]);
fam("General", "Officer", "laurel", 1, "gold", 48, [
  { passes: 85, count: 1 },
  { passes: 90, count: 2 },
  { passes: 95, count: 3 },
  { passes: 100, count: 5, label: "Five Star General", capstone: true },
]);

export const RANKS: RankDef[] = ladder;

/* Highest rank whose EXP and skill gates are both met. (Passes rise strictly
 * and skill never decreases along the ladder, so a single sweep works.) */
export function rankIndexOf(passes: number, skill: number): number {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (passes >= RANKS[i].passes && skill >= RANKS[i].skill) idx = i;
  }
  return idx;
}

/* Derive a training record from a user's full attempt history. Skill uses the
 * BEST score per distinct test (so a bad first try never drags you down —
 * matching how Halo tracked Highest Skill, not current). */
export function computeTrainingRecord(
  attempts: Array<{ testId: string; score: number; passed: boolean }>,
): { passes: number; testsTaken: number; avgBest: number; skill: number } {
  const passes = attempts.filter((a) => a.passed).length;
  const best = new Map<string, number>();
  for (const a of attempts) best.set(a.testId, Math.max(best.get(a.testId) ?? 0, a.score));
  const testsTaken = best.size;
  const avgBest = testsTaken
    ? [...best.values()].reduce((a, b) => a + b, 0) / testsTaken
    : 0;
  const skill = testsTaken ? Math.min(50, Math.max(1, Math.round(avgBest / 2))) : 0;
  return { passes, testsTaken, avgBest: Math.round(avgBest * 10) / 10, skill };
}
