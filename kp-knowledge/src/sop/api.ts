// Backend API client. Every call carries the caller's Firebase ID token; the
// backend re-verifies it and the kpstaffing.com domain server-side.

import { auth } from "../lib/firebase";
import type { Sop, SopDetail, SopPatch } from "./types";

const API_BASE = import.meta.env.VITE_SOP_API_BASE ?? "http://localhost:8080";

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
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

export function deleteSop(id: string): Promise<{ ok: boolean }> {
  return req(`/sops/${id}`, { method: "DELETE" });
}
