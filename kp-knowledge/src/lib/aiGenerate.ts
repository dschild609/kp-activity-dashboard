import { auth } from "./firebase";
import type { Exhibit } from "./exhibitPages";

const FN_BASE = "https://us-central1-client-health-dashboard-4826e.cloudfunctions.net";

/* All KP Knowledge Cloud Functions speak the same protocol: POST JSON with
 * a Firebase ID token, respond {ok, ...} or {ok:false, error}. */
async function postFn<T>(name: string, payload: unknown, failLabel: string): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();

  const resp = await fetch(`${FN_BASE}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || !body.ok) {
    throw new Error(body.error ?? `${failLabel} (HTTP ${resp.status})`);
  }
  return body as T;
}

export interface GenerateResult {
  testId: string;
  name: string;
  slideCount: number;
  questionCount: number;
}

/* Sends the Word doc (+ optional exhibits, pre-rendered to page images) to
 * the generateKnowledgeTest Cloud Function, which parses the doc, has
 * Claude build slides + a quiz — placing exhibit screenshots on relevant
 * slides — and saves a draft test. When includeScreenshots is true (default),
 * the function also pulls the screenshots embedded in the .docx itself onto
 * the slides they belong to. Generation runs on Opus and can take a couple
 * of minutes for long docs. */
export async function generateTestFromDoc(
  file: File,
  exhibits: Exhibit[] = [],
  includeScreenshots = true
): Promise<GenerateResult> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return postFn<GenerateResult>(
    "generateKnowledgeTest",
    { filename: file.name, data: btoa(binary), exhibits, includeScreenshots },
    "Generation failed"
  );
}

/* Applies a natural-language edit to a SAVED test — Claude rewrites the
 * affected slides/questions server-side and the caller reloads. Can take
 * a minute or two on Opus. */
export async function editTestWithAI(testId: string, instruction: string): Promise<void> {
  await postFn("editKnowledgeTest", { testId, instruction }, "Edit failed");
}

/* Adds a manually-uploaded image (or rasterized PDF pages) to a test's
 * asset library so the slide workbench can place it on slides. */
export async function uploadTestAssets(
  testId: string,
  exhibit: Exhibit
): Promise<Array<{ name: string; page: number; url: string }>> {
  const body = await postFn<{ assets: Array<{ name: string; page: number; url: string }> }>(
    "uploadKnowledgeAsset",
    { testId, name: exhibit.name, pages: exhibit.pages },
    "Upload failed"
  );
  return body.assets;
}

/* Crops a region (fractions 0-1) out of one of the test's asset images —
 * server-side at native resolution — and returns the new asset. */
export async function snipTestAsset(
  testId: string,
  name: string,
  sourceUrl: string,
  region: { x: number; y: number; w: number; h: number }
): Promise<{ name: string; page: number; url: string }> {
  const body = await postFn<{ asset: { name: string; page: number; url: string } }>(
    "snipKnowledgeAsset",
    { testId, name, sourceUrl, region },
    "Snip failed"
  );
  return body.asset;
}
