// Backend API client. Every call carries the caller's Firebase ID token; the
// backend re-verifies it and the kpstaffing.com domain server-side.

import { auth } from "../lib/firebase";
import type { Sop, SopDetail, SopPatch } from "./types";

const API_BASE = import.meta.env.VITE_SOP_API_BASE ?? "http://localhost:8080";

// Never send the Firebase ID token anywhere but the known KP backend — guards
// against a misbuilt/tampered VITE_SOP_API_BASE leaking the credential.
function isTrustedApiBase(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    return (
      u.protocol === "https:" &&
      u.hostname.startsWith("sop-recorder-") &&
      u.hostname.endsWith(".run.app")
    );
  } catch {
    return false;
  }
}
const API_TRUSTED = isTrustedApiBase(API_BASE);

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user || !API_TRUSTED) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(await authHeaders()),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(res.status, detail);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function listSops(params?: {
  branch?: string;
  system?: string;
  status?: string;
}): Promise<{ sops: Sop[] }> {
  const q = new URLSearchParams(
    Object.entries(params ?? {}).filter(([, v]) => v) as [string, string][],
  ).toString();
  return req(`/sops${q ? `?${q}` : ""}`);
}

export function getSop(id: string): Promise<SopDetail> {
  return req(`/sops/${id}`);
}

export function patchSop(id: string, patch: SopPatch): Promise<{ ok: boolean }> {
  return req(`/sops/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function publishSop(id: string): Promise<{ ok: boolean }> {
  return req(`/sops/${id}/publish`, { method: "POST" });
}

// Render the .docx exactly as publish would (nothing pushed to Drive, status
// unchanged) and return a short-lived download URL — lets the reviewer check
// the document and keep editing before committing.
export function previewSop(id: string): Promise<{ url: string }> {
  return req(`/sops/${id}/preview`, { method: "POST" });
}

// Mark the SOP reviewed & still-accurate now (clears "Needs review" without
// re-publishing). Returns the new lastVerifiedAt / nextReviewAt.
export function verifySop(
  id: string,
): Promise<{ ok: boolean; lastVerifiedAt: string; nextReviewAt: string | null }> {
  return req(`/sops/${id}/verify`, { method: "POST" });
}

export function deleteSop(id: string): Promise<{ ok: boolean }> {
  return req(`/sops/${id}`, { method: "DELETE" });
}

export function captureFrame(
  sopId: string,
  stepId: string,
  timestampMs: number,
): Promise<{ screenshotDownloadUrl: string }> {
  return req(`/sops/${sopId}/steps/${stepId}/frame`, {
    method: "POST",
    body: JSON.stringify({ timestampMs }),
  });
}
