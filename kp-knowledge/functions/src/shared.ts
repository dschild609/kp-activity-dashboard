// Shared plumbing for KP Knowledge functions: endpoint wrapper (method +
// manager-auth enforcement), token-URL Storage uploads, the structured
// Claude call used by both AI endpoints, and schema fragments both compose.

import { onRequest, type HttpsOptions, type Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// Opus — content quality matters (training material + fair quiz questions),
// and volume is a few runs a week.
export const AI_MODEL = "claude-opus-4-8";

export const ALLOWED_ORIGINS = [
  "http://localhost:5183",
  "https://knowledge.kpshub.app",
  "https://kp-knowledge.web.app",
  "https://kp-knowledge.firebaseapp.com",
];

// Max exhibit/asset page images per request (client mirrors this limit in
// src/lib/exhibitPages.ts — keep in sync).
export const MAX_PAGES = 20;

// Roles allowed to manage tests — mirrors canManageTests in the app.
const MANAGER_ROLES = new Set([
  "super_admin",
  "operations_manager",
  "ops_manager",
]);

export interface AuthResult {
  ok: boolean;
  status: number;
  error?: string;
  email?: string;
}

export async function verifyManager(authHeader: string | undefined): Promise<AuthResult> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing Authorization header" };
  }
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
    const snap = await admin.firestore().doc(`users/${decoded.uid}`).get();
    const data = snap.data() ?? {};
    const role: string =
      data.role_new ?? data.hubRole ?? (data.role === "admin" ? "super_admin" : "pending");
    if (data.role === "admin" || MANAGER_ROLES.has(role)) {
      return { ok: true, status: 200, email: decoded.email ?? decoded.uid };
    }
    return { ok: false, status: 403, error: "Not authorized to manage tests" };
  } catch {
    return { ok: false, status: 401, error: "Invalid token" };
  }
}

/* Every endpoint in this codebase is a manager-only POST returning the
 * {ok, ...}/{ok:false, error} envelope. The wrapper makes the auth check
 * structural — a new endpoint can't forget it. Handlers run with Admin SDK
 * privileges, so this IS the enforcement layer. */
export function managerEndpoint(
  opts: Omit<HttpsOptions, "cors">,
  handler: (req: Request, res: Response, auth: AuthResult) => Promise<void>
) {
  return onRequest({ cors: ALLOWED_ORIGINS, region: "us-central1", ...opts }, async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "POST only" });
      return;
    }
    const auth = await verifyManager(req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error });
      return;
    }
    await handler(req, res, auth);
  });
}

/* Save a JPEG to Storage with a Firebase-style download token and return
 * the tokened URL (same mechanism the client SDK uses). */
export async function uploadJpeg(path: string, buffer: Buffer): Promise<string> {
  const bucket = admin.storage().bucket();
  const token = randomUUID();
  const file = bucket.file(path);
  await file.save(buffer, {
    contentType: "image/jpeg",
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(path)}?alt=media&token=${token}`
  );
}

/* ── Structured Claude call (shared by generate + edit) ──────────── */

export class ClaudeRefusalError extends Error {
  constructor() {
    super("The model declined this request");
  }
}

type MessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } }
    >;

/* Runs one structured-output request and returns the parsed JSON. Throws
 * ClaudeRefusalError on a safety decline (map to 422) and plain Error on
 * anything else (map to 502). */
export async function claudeJson<T>(args: {
  system: string;
  content: MessageContent;
  schema: Record<string, unknown>;
}): Promise<T> {
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  const stream = anthropic.messages.stream({
    model: AI_MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    system: args.system,
    output_config: { format: { type: "json_schema", schema: args.schema } },
    messages: [{ role: "user", content: args.content }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new ClaudeRefusalError();
  const jsonText = message.content.find((b) => b.type === "text");
  if (!jsonText || jsonText.type !== "text") throw new Error("No text block in response");
  return JSON.parse(jsonText.text) as T;
}

/* ── Schema fragments shared by the generate + edit schemas ──────── */

export const COLUMNS_ITEMS_SCHEMA = {
  type: "object" as const,
  properties: {
    heading: { type: "string", description: "Column card heading" },
    bullets: {
      type: "array",
      items: { type: "string" },
      description: "3-6 concise bullets; use 'Lead — description' to bold a lead-in term",
    },
  },
  required: ["heading", "bullets"],
  additionalProperties: false,
};

export const STEPS_ITEMS_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string" },
    description: { type: "string", description: "One or two short sentences" },
  },
  required: ["title", "description"],
  additionalProperties: false,
};

/* Question fields (without id — the edit schema adds it) */
export const QUESTION_PROPS = {
  text: { type: "string" },
  type: { type: "string", enum: ["MC", "TF"] },
  optionA: { type: "string" },
  optionB: { type: "string" },
  optionC: { type: ["string", "null"], description: "null for TF questions" },
  optionD: { type: ["string", "null"], description: "null for TF questions" },
  correctAnswer: { type: "string", enum: ["A", "B", "C", "D"] },
};

export interface GeneratedQuestion {
  text: string;
  type: "MC" | "TF";
  optionA: string;
  optionB: string;
  optionC: string | null;
  optionD: string | null;
  correctAnswer: "A" | "B" | "C" | "D";
}
