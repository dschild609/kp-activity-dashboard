import type { Timestamp } from "firebase/firestore";

export type QuestionType = "MC" | "TF";
export type AnswerKey = "A" | "B" | "C" | "D";

/* Slide layouts from the "KP Training Template" deck:
 * - title:   dark ink cover — kicker, big title, subtitle, footer
 * - section: crimson divider — kicker ("SECTION TWO"), title, subtitle, giant number
 * - agenda:  numbered list rows on cream
 * - bullets: 1-2 white cards with headed dash-bullet lists (the workhorse)
 * - steps:   horizontal numbered process circles
 * - image:   split layout — exhibit screenshot left, kicker/title/body right */
export type SlideKind = "title" | "section" | "agenda" | "bullets" | "steps" | "image" | "video";

export interface SlideColumn {
  heading: string;
  /* "Lead — rest" bullets render the lead bold (template convention) */
  bullets: string[];
}

export interface SlideStep {
  title: string;
  description: string;
}

export interface KnowledgeSlide {
  kind: SlideKind;
  /* Small uppercase label above the title (e.g. "GETTING STARTED") */
  kicker: string | null;
  title: string;
  subtitle: string | null; // title / section / image slides
  items: string[] | null; // agenda rows
  columns: SlideColumn[] | null; // bullets slides (1-2 columns)
  steps: SlideStep[] | null; // steps slides (2-4)
  body: string | null; // image-slide paragraph
  note: string | null; // image-slide side note (crimson-bar callout)
  /* Screenshot shown on the slide (e.g. a blank W-4 page) — a Storage URL
   * from the test's assets */
  imageUrl?: string | null;
  imageLabel?: string | null;
  /* Where the screenshot sits on an image slide: left/right half, or
   * "top" for the horizontal variant (image across the top, text below —
   * best for wide snips like a single form row). Default left. */
  imagePosition?: "left" | "right" | "top";
  /* Video slide source — a pasted YouTube/Loom/Vimeo link or the download
   * URL of a file uploaded to Storage. Parsed at render time. */
  videoUrl?: string | null;
}

/* The one place a slide record is assembled — every field present, no
 * undefined (Firestore rejects undefined values). All constructors and
 * converters go through this. */
export function makeSlide(partial: Partial<KnowledgeSlide> & { kind: SlideKind }): KnowledgeSlide {
  return {
    kind: partial.kind,
    kicker: partial.kicker ?? null,
    title: partial.title ?? "",
    subtitle: partial.subtitle ?? null,
    items: partial.items ?? null,
    columns: partial.columns ?? null,
    steps: partial.steps ?? null,
    body: partial.body ?? null,
    note: partial.note ?? null,
    imageUrl: partial.imageUrl ?? null,
    imageLabel: partial.imageLabel ?? null,
    imagePosition: partial.imagePosition ?? "left",
    videoUrl: partial.videoUrl ?? null,
  };
}

/* Older tests stored slides as {title, bullets: string[]} — normalize to a
 * single-column bullets slide so everything downstream sees one shape. */
export function normalizeSlide(raw: Record<string, unknown>): KnowledgeSlide {
  if (typeof raw.kind === "string") {
    return makeSlide(raw as unknown as Partial<KnowledgeSlide> & { kind: SlideKind });
  }
  return makeSlide({
    kind: "bullets",
    title: (raw.title as string) ?? "",
    columns: [{ heading: "", bullets: (raw.bullets as string[]) ?? [] }],
    imageUrl: (raw.imageUrl as string | null) ?? null,
    imageLabel: (raw.imageLabel as string | null) ?? null,
  });
}

/* Stored exhibit page image (uploaded at AI-generation time) that slides
 * can display; kept on the test doc so the editor can offer a picker */
export interface KnowledgeAsset {
  name: string;
  page: number;
  url: string;
}

/* How many tries an employee gets:
 * - single:    one attempt; admin resets for retakes (legacy behavior)
 * - untilPass: retake freely until passed (training-first default)
 * - limited:   up to maxAttempts tries, stops early once passed */
export type RetakePolicy = "single" | "untilPass" | "limited";

/* Who a test is assigned to. Empty (all fields blank/false) = unassigned —
 * available to take but not tracked for completion. The assigned roster is
 * the union of everyone / roles / branches / specific people. */
export interface Assignment {
  everyone: boolean;
  roles: string[];
  branches: string[];
  uids: string[];
  /* Optional due date as an ISO date string "YYYY-MM-DD"; null = no due date. */
  dueDate: string | null;
}

export const EMPTY_ASSIGNMENT: Assignment = {
  everyone: false,
  roles: [],
  branches: [],
  uids: [],
  dueDate: null,
};

export function isAssigned(a: Assignment): boolean {
  return a.everyone || a.roles.length > 0 || a.branches.length > 0 || a.uids.length > 0;
}

export interface KnowledgeTest {
  id: string;
  name: string;
  description: string;
  assignment: Assignment;
  /* Pass rule from the original certification app: pass when
   * wrongCount <= maxWrongToPass (e.g. 15 questions, 3 wrong allowed = 80%) */
  maxWrongToPass: number;
  retakePolicy: RetakePolicy;
  /* Only used when retakePolicy === "limited" */
  maxAttempts: number;
  isActive: boolean;
  /* AI-generated tests start as "draft" (isActive false) until an admin
   * reviews and publishes; hand-made tests are "published" from creation */
  status: "draft" | "published";
  aiGenerated: boolean;
  sourceDocName: string | null;
  /* Training slides shown before the quiz (AI flow); empty = quiz only */
  slides: KnowledgeSlide[];
  /* Exhibit page images available to this test's slides */
  assets: KnowledgeAsset[];
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
