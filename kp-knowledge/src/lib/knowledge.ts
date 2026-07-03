import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  AnswerKey,
  GradedAnswer,
  KnowledgeAttempt,
  KnowledgeQuestion,
  KnowledgeTest,
} from "../types/knowledge";

const TESTS = "knowledgeTests";
const ATTEMPTS = "knowledgeAttempts";

function testFromDoc(id: string, data: Record<string, unknown>): KnowledgeTest {
  return {
    id,
    name: (data.name as string) ?? "",
    description: (data.description as string) ?? "",
    maxWrongToPass: (data.maxWrongToPass as number) ?? 0,
    isActive: (data.isActive as boolean) ?? false,
    status: (data.status as KnowledgeTest["status"]) ?? "published",
    aiGenerated: (data.aiGenerated as boolean) ?? false,
    sourceDocName: (data.sourceDocName as string) ?? null,
    slides: (data.slides as KnowledgeTest["slides"]) ?? [],
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

export async function submitAttempt(args: {
  uid: string;
  userName: string;
  userEmail: string;
  test: KnowledgeTest;
  result: GradeResult;
}): Promise<void> {
  await addDoc(collection(db, ATTEMPTS), {
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
      "name" | "description" | "maxWrongToPass" | "isActive" | "tags" | "slides" | "status"
    >
  >
): Promise<void> {
  await updateDoc(doc(db, TESTS, testId), fields);
}

export async function addQuestion(testId: string, q: NewQuestion): Promise<void> {
  const existing = await getQuestions(testId);
  await addDoc(collection(db, TESTS, testId, "questions"), {
    ...q,
    orderNum: (existing[existing.length - 1]?.orderNum ?? 0) + 1,
  });
  await updateDoc(doc(db, TESTS, testId), { questionCount: existing.length + 1 });
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
  const remaining = await getQuestions(testId);
  await updateDoc(doc(db, TESTS, testId), { questionCount: remaining.length });
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
