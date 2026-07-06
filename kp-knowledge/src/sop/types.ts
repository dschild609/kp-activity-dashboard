// Mirrors the Firestore data model (CLAUDE.md §6) as returned by the backend.

export type SopStatus = "processing" | "draft" | "published";

export interface BlurBox {
  x: number;
  y: number;
  w: number;
  h: number;
} // normalized 0–1

export interface Annotation {
  type: "arrow" | "circle";
  // normalized 0–1; arrow goes tail→head, circle uses the two points as a bbox
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string; // hex, no '#'
}

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
} // normalized 0–1 snip region

export interface ElementDescriptor {
  selector: string;
  text: string;
  ariaLabel: string;
  bbox: { x: number; y: number; w: number; h: number } | null;
}

export interface Step {
  id: string;
  order: number;
  timestampMs: number;
  screenshotUrl: string; // gs:// (raw)
  screenshotDownloadUrl?: string; // signed https URL for <img>
  narration: string;
  elementDescriptor: ElementDescriptor;
  title: string;
  instruction: string;
  blurBoxes: BlurBox[];
  annotations?: Annotation[];
  crop?: Crop | null;
}

export interface Sop {
  id: string;
  title: string;
  system: string;
  branch: string;
  task: string;
  creatorEmail: string;
  status: SopStatus;
  overview: string;
  whyItMatters?: string;
  bottomLine?: string;
  videoUrl: string;
  version: number;
  processingError?: string;
}

export interface SopDetail extends Sop {
  steps: Step[];
  videoDownloadUrl?: string; // signed URL of the full recording, for scrubbing
}

// PATCH payload — full desired step order; omitted ids are deleted server-side.
export interface StepPatch {
  id: string;
  title: string;
  instruction: string;
  blurBoxes: BlurBox[];
  annotations: Annotation[];
  crop?: Crop | null;
}

export interface SopPatch {
  title?: string;
  system?: string;
  branch?: string;
  task?: string;
  overview?: string;
  whyItMatters?: string;
  bottomLine?: string;
  steps?: StepPatch[];
}
