import { auth } from "./firebase";
import type { Exhibit } from "./exhibitPages";

const GENERATE_URL =
  "https://us-central1-client-health-dashboard-4826e.cloudfunctions.net/generateKnowledgeTest";

export interface GenerateResult {
  testId: string;
  name: string;
  slideCount: number;
  questionCount: number;
}

/* Sends the Word doc (+ optional exhibits, pre-rendered to page images) to
 * the generateKnowledgeTest Cloud Function, which parses the doc, has
 * Claude build slides + a quiz — placing exhibit screenshots on relevant
 * slides — and saves a draft test. Generation runs on Opus and can take a
 * couple of minutes for long docs. */
export async function generateTestFromDoc(
  file: File,
  exhibits: Exhibit[] = []
): Promise<GenerateResult> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();

  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const data = btoa(binary);

  const resp = await fetch(GENERATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ filename: file.name, data, exhibits }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || !body.ok) {
    throw new Error(body.error ?? `Generation failed (HTTP ${resp.status})`);
  }
  return body as GenerateResult;
}
