import { callManagerFn } from "./managerApi";

/* Manager-gated reminder trigger (Cloud Function runKnowledgeReminders):
 * preview = who WOULD be emailed right now; send = actually email them.
 * The daily 8am job does this automatically — this is the on-demand twin. */

export type ReminderKind = "assigned" | "dueSoon" | "overdue";

export interface ReminderRow {
  to: string;
  name: string;
  test: string;
  kind: ReminderKind;
  dueDate: string | null;
}

/** The reminders that would be emailed right now (sends nothing). */
export async function previewReminders(): Promise<ReminderRow[]> {
  const body = await callManagerFn<{ wouldSend?: ReminderRow[] }>("runKnowledgeReminders", { mode: "dryRun" });
  return body.wouldSend ?? [];
}

/** Send all currently-due reminders now. */
export async function sendReminders(): Promise<{ sent: number; failed: number; candidates: number }> {
  const body = await callManagerFn<{ sent?: number; failed?: number; candidates?: number }>(
    "runKnowledgeReminders",
    { mode: "send" }
  );
  return { sent: body.sent ?? 0, failed: body.failed ?? 0, candidates: body.candidates ?? 0 };
}

export const REMINDER_LABEL: Record<ReminderKind, string> = {
  assigned: "New assignment",
  dueSoon: "Due soon",
  overdue: "Overdue",
};
