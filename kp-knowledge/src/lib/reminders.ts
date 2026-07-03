import { auth } from "./firebase";

/* Manager-gated reminder trigger (Cloud Function runKnowledgeReminders):
 * preview = who WOULD be emailed right now; send = actually email them.
 * The daily 8am job does this automatically — this is the on-demand twin. */
const URL =
  "https://us-central1-client-health-dashboard-4826e.cloudfunctions.net/runKnowledgeReminders";

export type ReminderKind = "assigned" | "dueSoon" | "overdue";

export interface ReminderRow {
  to: string;
  name: string;
  test: string;
  kind: ReminderKind;
  dueDate: string | null;
}

async function call(mode: "dryRun" | "send"): Promise<Record<string, unknown>> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  const resp = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mode }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || !body.ok) throw new Error(body.error ?? `Reminders failed (HTTP ${resp.status})`);
  return body;
}

/** The reminders that would be emailed right now (sends nothing). */
export async function previewReminders(): Promise<ReminderRow[]> {
  const body = await call("dryRun");
  return (body.wouldSend as ReminderRow[]) ?? [];
}

/** Send all currently-due reminders now. */
export async function sendReminders(): Promise<{ sent: number; failed: number; candidates: number }> {
  const body = await call("send");
  return {
    sent: (body.sent as number) ?? 0,
    failed: (body.failed as number) ?? 0,
    candidates: (body.candidates as number) ?? 0,
  };
}

export const REMINDER_LABEL: Record<ReminderKind, string> = {
  assigned: "New assignment",
  dueSoon: "Due soon",
  overdue: "Overdue",
};
