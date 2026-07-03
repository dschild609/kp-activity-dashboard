import type { Timestamp } from "firebase/firestore";

export type QuestionType = "MC" | "TF";
export type AnswerKey = "A" | "B" | "C" | "D";

export interface KnowledgeTest {
  id: string;
  name: string;
  description: string;
  /* Pass rule from the original certification app: pass when
   * wrongCount <= maxWrongToPass (e.g. 15 questions, 3 wrong allowed = 80%) */
  maxWrongToPass: number;
  isActive: boolean;
  tags: string[];
  questionCount: number;
  createdBy: string;
  createdAt: Timestamp | null;
}

export interface KnowledgeQuestion {
  id: string;
  text: string;
  type: QuestionType;
  optionA: string;
  optionB: string;
  optionC: string | null;
  optionD: string | null;
  correctAnswer: AnswerKey;
  orderNum: number;
}

export interface GradedAnswer {
  given: AnswerKey | null;
  correct: AnswerKey;
  isCorrect: boolean;
}

export interface KnowledgeAttempt {
  id: string;
  uid: string;
  userName: string;
  userEmail: string;
  testId: string;
  testName: string;
  score: number;
  passed: boolean;
  correctCount: number;
  totalCount: number;
  answers: Record<string, GradedAnswer>;
  submittedAt: Timestamp | null;
}
