// Shared plumbing for KP Knowledge functions: caller verification and
// token-URL Storage uploads.

import * as admin from "firebase-admin";
import { randomUUID } from "crypto";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const ALLOWED_ORIGINS = [
  "http://localhost:5183",
  "https://knowledge.kpshub.app",
  "https://kp-knowledge.web.app",
  "https://kp-knowledge.firebaseapp.com",
];

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
