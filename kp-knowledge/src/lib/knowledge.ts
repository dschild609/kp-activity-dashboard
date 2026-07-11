import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { DEFAULT_SHIP_ID, ownedShipIds } from "./ships";
import { computeTrainingRecord } from "./ranks";
import {
  normalizeSlide,
  type AnswerKey,
  type GradedAnswer,
  type KnowledgeAttempt,
  type KnowledgeLeaderboardEntry,
  type KnowledgeOpen,
  type KnowledgePoints,
  type KnowledgeQuestion,
  type KnowledgeRankRecord,
  type KnowledgeTest,
} from "../types/knowledge";

const TESTS = "knowledgeTests";
const ATTEMPTS = "knowledgeAttempts";
const OPENS = "knowledgeOpens";
const LEADERBOARD = "knowledgeLeaderboard";
const POINTS = "knowledgePoints";
const RANKS_COL = "knowledgeRanks";

/* Record the first time this user opened a test (immutable — later opens are
 * a no-op). Best-effort: never blocks or throws into the taker's flow. */
export async function recordOpen(testId: string, uid: string): Promise<void> {
  try {
    const ref = doc(db, OPENS, `${testId}__${uid}`);
    if ((await getDoc(ref)).exists()) return;
    await setDoc(ref, { uid, testId, openedAt: serverTimestamp() });
  } catch {
    /* opens are analytics-only — swallow (e.g. a lost race on first open) */
  }
}

/* Every open record (manager-only read via rules) — for the completion view. */
export async function listOpens(): Promise<KnowledgeOpen[]> {
  const snap = await getDocs(collection(db, OPENS));
  return snap.docs.map((d) => d.data() as KnowledgeOpen);
}

function testFromDoc(id: string, data: Record<string, unknown>): KnowledgeTest {
  return {
    id,
    name: (data.name as string) ?? "",
    description: (data.description as string) ?? "",
    maxWrongToPass: (data.maxWrongToPass as number) ?? 0,
    assignment: {
      everyone: false,
      roles: [],
      branches: [],
      uids: [],
      excludeUids: [],
      dueDate: null,
      ...((data.assignment as Partial<KnowledgeTest["assignment"]>) ?? {}),
    },
    retakePolicy: (data.retakePolicy as KnowledgeTest["retakePolicy"]) ?? "single",
    maxAttempts: (data.maxAttempts as number) ?? 3,
    isActive: (data.isActive as boolean) ?? false,
    status: (data.status as KnowledgeTest["status"]) ?? "published",
    aiGenerated: (data.aiGenerated as boolean) ?? false,
    sourceDocName: (data.sourceDocName as string) ?? null,
    slides: ((data.slides as Array<Record<string, unknown>>) ?? []).map(normalizeSlide),
    assets: (data.assets as KnowledgeTest["assets"]) ?? [],
    tags: (data.tags as string[]) ?? [],
    questionCount: (data.questionCount as number) ?? 0,
    createdBy: (data.createdBy as string) ?? "",
    createdAt: (data.createdAt as KnowledgeTest["createdAt"]) ?? null,
  };
}

export async function getTest(testId: string): Promise<KnowledgeTest | null> {
  const snap = await getDoc(doc(db, TESTS, testId));
  return snap.exists() ? testFromDoc(snap.id, snap.data()) : null;
}

export async function listTests(opts: { activeOnly: boolean }): Promise<KnowledgeTest[]> {
  const base = collection(db, TESTS);
  const q = opts.activeOnly ? query(base, where("isActive", "==", true)) : query(base);
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => testFromDoc(d.id, d.data()))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getQuestions(testId: string): Promise<KnowledgeQuestion[]> {
  const snap = await getDocs(
    query(collection(db, TESTS, testId, "questions"), orderBy("orderNum"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as KnowledgeQuestion);
}

export async function listAttempts(filter: { uid?: string; testId?: string }): Promise<KnowledgeAttempt[]> {
  const clauses = [];
  if (filter.uid) clauses.push(where("uid", "==", filter.uid));
  if (filter.testId) clauses.push(where("testId", "==", filter.testId));
  const snap = await getDocs(query(collection(db, ATTEMPTS), ...clauses));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as KnowledgeAttempt)
    .sort((a, b) => (b.submittedAt?.toMillis() ?? 0) - (a.submittedAt?.toMillis() ?? 0));
}

export interface GradeResult {
  score: number;
  passed: boolean;
  correctCount: number;
  totalCount: number;
  wrongCount: number;
  graded: Record<string, GradedAnswer>;
}

export function gradeAnswers(
  questions: KnowledgeQuestion[],
  answers: Record<string, AnswerKey | null>,
  maxWrongToPass: number
): GradeResult {
  const graded: Record<string, GradedAnswer> = {};
  let correctCount = 0;
  for (const q of questions) {
    const given = answers[q.id] ?? null;
    const isCorrect = given === q.correctAnswer;
    if (isCorrect) correctCount += 1;
    graded[q.id] = { given, correct: q.correctAnswer, isCorrect };
  }
  const totalCount = questions.length;
  const wrongCount = totalCount - correctCount;
  return {
    score: totalCount ? Math.round((correctCount / totalCount) * 10000) / 100 : 0,
    passed: wrongCount <= maxWrongToPass,
    correctCount,
    totalCount,
    wrongCount,
    graded,
  };
}

/* The one fallback chain for the display name we stamp into Firestore docs
 * (attempts, leaderboard rows, wallets) — keep every writer consistent. */
export function userNameOf(u: { displayName: string | null; email: string | null }): string {
  return u.displayName ?? u.email ?? "Unknown";
}

export async function submitAttempt(args: {
  uid: string;
  userName: string;
  userEmail: string;
  test: KnowledgeTest;
  result: GradeResult;
}): Promise<void> {
  const attempt = addDoc(collection(db, ATTEMPTS), {
    uid: args.uid,
    userName: args.userName,
    userEmail: args.userEmail,
    testId: args.test.id,
    testName: args.test.name,
    score: args.result.score,
    passed: args.result.passed,
    correctCount: args.result.correctCount,
    totalCount: args.result.totalCount,
    answers: args.result.graded,
    submittedAt: serverTimestamp(),
  });
  // Award points = your best % on this test (topped up if you beat it).
  // Best-effort and independent of the attempt write — run them in parallel so
  // the submit spinner doesn't wait an extra round trip on the award.
  await Promise.all([attempt, awardTestPoints(args.uid, args.userName, args.test.id, args.result.score)]);
  // Refresh the public Halo-ladder rank record off the full history (includes
  // the attempt just written). Fire-and-forget — the result page needn't wait.
  void updateTrainingRecord(args.uid, args.userName);
}

/* ── Training ranks (Halo ladder) ────────────────────────────────────
 * One world-readable doc per user, recomputed wholesale from their own
 * attempts so it self-heals/backfills on every submit. */
export async function updateTrainingRecord(uid: string, userName: string): Promise<void> {
  try {
    const attempts = await listAttempts({ uid });
    // Skill growth is order-dependent (each win builds on the last), so hand
    // the compute a chronological key.
    const rec = computeTrainingRecord(
      attempts.map((a) => ({ ...a, at: a.submittedAt?.toMillis() ?? 0 })),
    );
    if (rec.testsTaken === 0) return;
    await setDoc(doc(db, RANKS_COL, uid), { uid, userName, ...rec, updatedAt: serverTimestamp() });
  } catch {
    /* rank ladder is a nice-to-have — never break the submit flow */
  }
}

/* The whole ladder, best skill first (final ordering is done client-side by
 * rank → skill → passes, but skill is the dominant term). */
export async function listRanks(max = 200): Promise<KnowledgeRankRecord[]> {
  const snap = await getDocs(
    query(collection(db, RANKS_COL), orderBy("skill", "desc"), limit(max)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<KnowledgeRankRecord, "id">) }));
}

/* ── Points wallet ────────────────────────────────────────────────────
 * A spendable per-user balance (doc id = uid). Earned from tests (best %
 * per test, weighted heavy) + Asteroids (best score ÷ 100); `spent` rises
 * as points are redeemed in the Store (or by a manager). */
interface PointsMutable {
  perTest: Record<string, number>;
  asteroidsPoints: number;
  spent: number;
  owned: string[];
  equippedShip: string;
}

/* The ONE place the wallet doc is read, derived (testPoints/earned/balance),
 * and written. Callers change the wallet through `mutate`; returning false
 * skips the write (nothing to do). Throws on failure — user-initiated flows
 * (buy/equip) surface errors, while the award paths wrap this best-effort. */
async function writePoints(
  uid: string,
  userName: string,
  mutate: (p: PointsMutable) => boolean | void,
): Promise<void> {
  const ref = doc(db, POINTS, uid);
  const snap = await getDoc(ref);
  const cur = (snap.exists() ? snap.data() : {}) as Partial<KnowledgePoints>;
  const p: PointsMutable = {
    perTest: { ...(cur.perTest ?? {}) },
    asteroidsPoints: cur.asteroidsPoints ?? 0,
    spent: cur.spent ?? 0,
    owned: [...(cur.owned ?? [])],
    equippedShip: cur.equippedShip ?? DEFAULT_SHIP_ID,
  };
  if (mutate(p) === false) return;
  const testPoints = Object.values(p.perTest).reduce((a, b) => a + b, 0);
  const earned = testPoints + p.asteroidsPoints;
  await setDoc(ref, {
    uid,
    userName,
    perTest: p.perTest,
    testPoints,
    asteroidsPoints: p.asteroidsPoints,
    earned,
    spent: p.spent,
    balance: earned - p.spent,
    owned: p.owned,
    equippedShip: p.equippedShip,
    updatedAt: serverTimestamp(),
  });
}

/** Buy a store item: deducts its cost (raises `spent`), records ownership, and
 *  auto-equips the ship. Throws if the balance can't cover it — the Store
 *  surfaces failures to the buyer. */
export async function purchaseShip(
  uid: string,
  userName: string,
  ship: { id: string; cost: number },
): Promise<void> {
  await writePoints(uid, userName, (p) => {
    if (ownedShipIds(p.owned).has(ship.id)) return false; // already owned
    const earned = Object.values(p.perTest).reduce((a, b) => a + b, 0) + p.asteroidsPoints;
    if (earned - p.spent < ship.cost) throw new Error("Not enough points for that ship.");
    p.spent += ship.cost;
    p.owned.push(ship.id);
    p.equippedShip = ship.id; // fly it right away
  });
}

/** Equip an owned ship (or the free default). Throws so the UI can report. */
export async function equipShip(uid: string, userName: string, shipId: string): Promise<void> {
  await writePoints(uid, userName, (p) => {
    if (!ownedShipIds(p.owned).has(shipId)) return false;
    p.equippedShip = shipId;
  });
}

export async function awardTestPoints(
  uid: string,
  userName: string,
  testId: string,
  scorePct: number,
): Promise<void> {
  const pts = Math.max(0, Math.round(scorePct));
  try {
    await writePoints(uid, userName, (p) => {
      p.perTest[testId] = Math.max(p.perTest[testId] ?? 0, pts);
    });
  } catch {
    /* awards are a nice-to-have — never break the flow they hang off */
  }
}

export async function awardAsteroidsPoints(
  uid: string,
  userName: string,
  bestScore: number,
): Promise<void> {
  const pts = Math.max(0, Math.floor(bestScore / 100));
  try {
    await writePoints(uid, userName, (p) => {
      p.asteroidsPoints = Math.max(p.asteroidsPoints, pts);
    });
  } catch {
    /* awards are a nice-to-have — never break the flow they hang off */
  }
}

/* Live view of a user's wallet (null = no wallet yet / unreadable). One
 * onSnapshot per subscriber; the SDK dedupes identical doc listens. */
export function subscribePoints(uid: string, cb: (p: KnowledgePoints | null) => void): () => void {
  return onSnapshot(
    doc(db, POINTS, uid),
    (snap) => cb(snap.exists() ? (snap.data() as KnowledgePoints) : null),
    () => cb(null),
  );
}

/* ── Asteroids leaderboard ───────────────────────────────────────────
 * One doc per user (id = uid) holding their all-time best arcade score.
 * Best-effort and best-of: only writes when it beats their current record,
 * and never throws into the game's end screen. */
export async function submitHighScore(args: {
  uid: string;
  userName: string;
  score: number;
  test: KnowledgeTest;
}): Promise<void> {
  if (!(args.score > 0)) return;
  try {
    const ref = doc(db, LEADERBOARD, args.uid);
    const snap = await getDoc(ref);
    const row = {
      uid: args.uid,
      userName: args.userName,
      score: args.score,
      testId: args.test.id,
      testName: args.test.name,
      updatedAt: serverTimestamp(),
    };
    // `row` is the complete doc, so one setDoc covers both create and best-of
    // update (the rules also enforce score-can-only-increase). A new personal
    // best also tops up the arcade share of their points — independent writes,
    // so run them in parallel.
    if (!snap.exists() || args.score > (snap.data().score ?? 0)) {
      await Promise.all([
        setDoc(ref, row),
        awardAsteroidsPoints(args.uid, args.userName, args.score),
      ]);
    }
  } catch {
    /* leaderboard is a nice-to-have — swallow failures */
  }
}

/* Top arcade scores across everyone with knowledge access, highest first. */
export async function listLeaderboard(max = 25): Promise<KnowledgeLeaderboardEntry[]> {
  const snap = await getDocs(
    query(collection(db, LEADERBOARD), orderBy("score", "desc"), limit(max)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<KnowledgeLeaderboardEntry, "id">) }));
}

/* ── Admin operations ────────────────────────────────────────────── */

export interface NewQuestion {
  text: string;
  type: "MC" | "TF";
  optionA: string;
  optionB: string;
  optionC: string | null;
  optionD: string | null;
  correctAnswer: AnswerKey;
}

export async function createTest(args: {
  name: string;
  description: string;
  maxWrongToPass: number;
  tags: string[];
  questions: NewQuestion[];
  createdBy: string;
}): Promise<string> {
  const testRef = doc(collection(db, TESTS));
  const batch = writeBatch(db);
  batch.set(testRef, {
    name: args.name,
    description: args.description,
    maxWrongToPass: args.maxWrongToPass,
    retakePolicy: "untilPass",
    maxAttempts: 3,
    isActive: true,
    tags: args.tags,
    questionCount: args.questions.length,
    createdBy: args.createdBy,
    createdAt: serverTimestamp(),
  });
  args.questions.forEach((q, i) => {
    batch.set(doc(collection(db, TESTS, testRef.id, "questions")), {
      ...q,
      orderNum: i + 1,
    });
  });
  await batch.commit();
  return testRef.id;
}

export async function updateTest(
  testId: string,
  fields: Partial<
    Pick<
      KnowledgeTest,
      | "name"
      | "description"
      | "maxWrongToPass"
      | "retakePolicy"
      | "maxAttempts"
      | "isActive"
      | "tags"
      | "slides"
      | "status"
      | "assignment"
    >
  >
): Promise<void> {
  await updateDoc(doc(db, TESTS, testId), fields);
}

/* What the retake policy allows for a user's attempt history */
export function attemptGate(
  test: Pick<KnowledgeTest, "retakePolicy" | "maxAttempts">,
  attempts: KnowledgeAttempt[]
): { canTake: boolean; reason: "passed" | "single-used" | "out-of-attempts" | null; retakeable: boolean } {
  // `retakeable` is the ONE place that decides which locks a voluntary retake
  // (?retake=1) may override: only the "already passed" lock — a pass is
  // sticky (attempts are append-only, points/leaderboard are best-of), so a
  // practice retake is harmless under any policy. Admin caps (single-used /
  // out-of-attempts) are never overridable.
  if (attempts.some((a) => a.passed)) return { canTake: false, reason: "passed", retakeable: true };
  if (attempts.length === 0) return { canTake: true, reason: null, retakeable: false };
  switch (test.retakePolicy) {
    case "single":
      return { canTake: false, reason: "single-used", retakeable: false };
    case "untilPass":
      return { canTake: true, reason: null, retakeable: false };
    case "limited":
      return attempts.length < test.maxAttempts
        ? { canTake: true, reason: null, retakeable: false }
        : { canTake: false, reason: "out-of-attempts", retakeable: false };
  }
}

export async function addQuestion(testId: string, q: NewQuestion): Promise<void> {
  const last = await getDocs(
    query(collection(db, TESTS, testId, "questions"), orderBy("orderNum", "desc"), limit(1))
  );
  await addDoc(collection(db, TESTS, testId, "questions"), {
    ...q,
    orderNum: ((last.docs[0]?.data().orderNum as number) ?? 0) + 1,
  });
  await updateDoc(doc(db, TESTS, testId), { questionCount: increment(1) });
}

export async function updateQuestion(
  testId: string,
  questionId: string,
  fields: Partial<Omit<KnowledgeQuestion, "id">>
): Promise<void> {
  await updateDoc(doc(db, TESTS, testId, "questions", questionId), fields);
}

export async function deleteQuestion(testId: string, questionId: string): Promise<void> {
  await deleteDoc(doc(db, TESTS, testId, "questions", questionId));
  await updateDoc(doc(db, TESTS, testId), { questionCount: increment(-1) });
}

export async function deleteTest(testId: string): Promise<void> {
  const batch = writeBatch(db);
  const questions = await getDocs(collection(db, TESTS, testId, "questions"));
  questions.docs.forEach((d) => batch.delete(d.ref));
  const attempts = await getDocs(query(collection(db, ATTEMPTS), where("testId", "==", testId)));
  attempts.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, TESTS, testId));
  await batch.commit();
}

export async function deleteAttempt(attemptId: string): Promise<void> {
  await deleteDoc(doc(db, ATTEMPTS, attemptId));
}
