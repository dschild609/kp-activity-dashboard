// Halo 3-style training ranks — the full 42-step mastery ladder from the
// "Rank Insignia" spec: every rank family has Grades (2–4 steps), enlisted
// wear bronze/gold, officers silver, and each family's Grade 4 is a named
// capstone (Master Sergeant, First Lieutenant, … Five Star General).
//
// EXP = passing attempts ("battles won" — practice retakes count), Skill =
// Halo's 1–50 scale, EARNED win by win (see computeTrainingRecord — the one
// place the formula lives). Ranks gate on BOTH, exactly like Halo 3's dual
// EXP + Highest Skill requirements — grinding attempts alone stalls you in
// the enlisted ranks; the officer ladder demands scores. Grades within a
// family are pure EXP.

export type RankSymbol = "diamond" | "chevron" | "bar" | "star" | "wings" | "laurel";
export type RankMetal = "bronze" | "gold" | "silver";
export type RankGroup = "Enlisted" | "Officer";

export interface RankDef {
  id: string;
  /* Display name — the family name, or the Grade 4 capstone's own name */
  name: string;
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

/* "Grade 2"… sub-label under a rank's name (null on a family's first step). */
export function rankSub(rank: RankDef): string | null {
  return rank.grade > 1 ? `Grade ${rank.grade}` : null;
}

interface GradeStep {
  passes: number;
  /* A named step (Master Sergeant, Five Star General, …) IS the capstone. */
  label?: string;
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
      group,
      symbol,
      count: g.count ?? count,
      grade: i + 1,
      capstone: !!g.label,
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
  { passes: 16, label: "Master Sergeant" },
]);

/* ── Officer ──────────────────────────────────────────────────────── */
fam("Lieutenant", "Officer", "bar", 1, "silver", 28, [
  { passes: 18 }, { passes: 20 }, { passes: 22 },
  { passes: 24, label: "First Lieutenant" },
]);
fam("Captain", "Officer", "bar", 2, "silver", 32, [
  { passes: 26 }, { passes: 28 }, { passes: 30 },
  { passes: 32, label: "Staff Captain" },
]);
fam("Major", "Officer", "star", 1, "silver", 36, [
  { passes: 34 }, { passes: 36 }, { passes: 38 },
  { passes: 40, label: "Field Major" },
]);
fam("Commander", "Officer", "star", 2, "silver", 40, [
  { passes: 43 }, { passes: 46 }, { passes: 49 },
  { passes: 52, label: "Strike Commander" },
]);
fam("Colonel", "Officer", "star", 3, "silver", 43, [
  { passes: 55 }, { passes: 58 }, { passes: 61 },
  { passes: 64, label: "Force Colonel" },
]);
fam("Brigadier", "Officer", "wings", 1, "silver", 46, [
  { passes: 68 }, { passes: 72 }, { passes: 76 },
  { passes: 80, label: "Brigadier General" },
]);
fam("General", "Officer", "laurel", 1, "gold", 48, [
  { passes: 85, count: 1 },
  { passes: 90, count: 2 },
  { passes: 95, count: 3 },
  { passes: 100, count: 5, label: "Five Star General" },
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

/* Derive a training record from a user's full attempt history.
 *
 * Skill grows like Halo's TrueSkill — it is EARNED through wins, never handed
 * out: starting from 1, each PASSING attempt (in order) pulls your skill 12%
 * of the way toward that win's ceiling (its score ÷ 2). One perfect test gets
 * you ~6, two wins land you around 10, five straight 100%s ~24 — and the
 * legendary 50 takes a ~36-win streak of near-perfect scores. Your scores
 * still set your ceiling — a 70% player converges to ~35 and can't out-grind
 * the officer skill gates — and like Halo's Highest Skill, it never goes back
 * down (losses just don't help). */
const SKILL_GROWTH = 0.12;

export function computeTrainingRecord(
  attempts: Array<{ testId: string; score: number; passed: boolean; at?: number }>,
): { passes: number; testsTaken: number; avgBest: number; skill: number } {
  const ordered = [...attempts].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const passes = ordered.filter((a) => a.passed).length;
  const best = new Map<string, number>();
  for (const a of ordered) best.set(a.testId, Math.max(best.get(a.testId) ?? 0, a.score));
  const testsTaken = best.size;
  const avgBest = testsTaken
    ? [...best.values()].reduce((a, b) => a + b, 0) / testsTaken
    : 0;
  let s = 0;
  for (const a of ordered) {
    if (!a.passed) continue;
    const ceiling = a.score / 2;
    if (ceiling > s) s += SKILL_GROWTH * (ceiling - s);
  }
  const skill = testsTaken ? Math.min(50, Math.max(1, Math.round(s))) : 0;
  return { passes, testsTaken, avgBest: Math.round(avgBest * 10) / 10, skill };
}
