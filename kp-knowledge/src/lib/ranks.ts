// Halo 3-style training ranks. EXP = passing attempts ("battles won" —
// practice retakes count), Skill = your average best score across the tests
// you've taken, mapped onto Halo's 1–50 skill scale (a perfect 100% average
// is the legendary 50). Ranks gate on BOTH, exactly like Halo 3's dual
// EXP + Highest Skill requirements — grinding attempts alone caps you out in
// the enlisted ranks; the officer ladder demands scores.

export interface RankDef {
  id: string;
  name: string;
  /* Passing attempts required (EXP) */
  passes: number;
  /* Minimum skill (1–50) required */
  skill: number;
}

export const RANKS: RankDef[] = [
  { id: "recruit", name: "Recruit", passes: 0, skill: 0 },
  { id: "apprentice", name: "Apprentice", passes: 1, skill: 0 },
  { id: "private", name: "Private", passes: 2, skill: 5 },
  { id: "corporal", name: "Corporal", passes: 3, skill: 12 },
  { id: "sergeant", name: "Sergeant", passes: 4, skill: 18 },
  { id: "gunnery-sergeant", name: "Gunnery Sergeant", passes: 6, skill: 24 },
  { id: "lieutenant", name: "Lieutenant", passes: 8, skill: 28 },
  { id: "captain", name: "Captain", passes: 10, skill: 32 },
  { id: "major", name: "Major", passes: 13, skill: 36 },
  { id: "commander", name: "Commander", passes: 16, skill: 40 },
  { id: "colonel", name: "Colonel", passes: 20, skill: 43 },
  { id: "brigadier", name: "Brigadier", passes: 25, skill: 46 },
  { id: "general", name: "General", passes: 30, skill: 48 },
];

export function rankName(rankIndex: number): string {
  return RANKS[Math.max(0, Math.min(rankIndex, RANKS.length - 1))].name;
}

/* Highest rank whose EXP and skill gates are both met. */
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
