import { auth } from "./firebase";
import type { Assignment } from "../types/knowledge";

const ROSTER_URL =
  "https://us-central1-client-health-dashboard-4826e.cloudfunctions.net/getKnowledgeRoster";

export interface RosterUser {
  uid: string;
  name: string;
  email: string;
  branch: string | null;
  role: string | null;
  knowledge: boolean;
}

/* The staff roster (from the admin-gated Cloud Function) — used for the
 * assignment person-picker and the completion view. */
export async function getRoster(): Promise<RosterUser[]> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  const resp = await fetch(ROSTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: "{}",
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || !body.ok) throw new Error(body.error ?? `Roster failed (HTTP ${resp.status})`);
  return body.users as RosterUser[];
}

/* The staff who a test's assignment resolves to — the union of everyone /
 * roles / branches / specific people, limited to people who can take tests
 * (appAccess.knowledge). Used for the assignment summary + completion view. */
export function resolveAssigned(a: Assignment, roster: RosterUser[]): RosterUser[] {
  const takers = roster.filter((u) => u.knowledge);
  if (a.everyone) return takers;
  const uids = new Set(a.uids);
  const roles = new Set(a.roles);
  const branches = new Set(a.branches);
  return takers.filter(
    (u) =>
      uids.has(u.uid) ||
      (u.role != null && roles.has(u.role)) ||
      (u.branch != null && branches.has(u.branch))
  );
}

// Legacy role spellings → canonical (mirror of the server's ROLE_ALIASES).
const ROLE_ALIASES: Record<string, string> = { ops_manager: "operations_manager" };
export function normalizeRole(r: string | null): string | null {
  return r ? (ROLE_ALIASES[r] ?? r) : null;
}

/* Does a test's assignment target this specific user? Used to show the
 * "Assigned to you" badge on the employee Tests page. */
export function assignmentMatchesUser(
  a: Assignment,
  ctx: { uid: string; role: string | null; branch: string | null }
): boolean {
  if (a.everyone) return true;
  if (a.uids.includes(ctx.uid)) return true;
  const role = normalizeRole(ctx.role);
  if (role && a.roles.includes(role)) return true;
  if (ctx.branch && a.branches.includes(ctx.branch)) return true;
  return false;
}

/* Today's local date as "YYYY-MM-DD" for lexicographic due-date compares. */
export function todayIso(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/* Days from today to the due date (negative = overdue). */
export function daysUntil(dueDate: string): number {
  const [y, m, d] = dueDate.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - start.getTime()) / 86400000);
}

/* Format an ISO due date for display, e.g. "Jul 15". */
export function formatDue(dueDate: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* Assignable roles (canonical) with friendly labels — mirrors the KP role
 * vocabulary. Order roughly by tier. */
export const ASSIGNABLE_ROLES: Array<{ id: string; label: string }> = [
  { id: "recruiter", label: "Recruiter" },
  { id: "onsite_recruiter", label: "On-Site Recruiter" },
  { id: "account_manager", label: "Account Manager" },
  { id: "sales", label: "Sales" },
  { id: "onsite_manager", label: "On-Site Manager" },
  { id: "branch_manager", label: "Branch Manager" },
  { id: "recruiting_manager", label: "Recruiting Manager" },
  { id: "operations_manager", label: "Operations Manager" },
  { id: "area_manager", label: "Area Manager" },
  { id: "corporate_opps", label: "Corporate Opps" },
  { id: "corporate_management", label: "Corporate Management" },
  { id: "administration", label: "Administration" },
  { id: "hr", label: "HR" },
  { id: "super_admin", label: "Super Admin" },
];

export function roleLabel(id: string | null): string {
  if (!id) return "—";
  return ASSIGNABLE_ROLES.find((r) => r.id === id)?.label ?? id;
}

/* KP branch codes (CORP = corporate). */
export const BRANCHES = [
  "ARL", "ATL", "CARR", "CORP", "DENT", "DUNC", "FORT", "GARL", "GRAN",
  "HNC", "HOU", "IRV", "KC", "MEM", "NHOU", "PAS", "PHX", "SAG",
] as const;
