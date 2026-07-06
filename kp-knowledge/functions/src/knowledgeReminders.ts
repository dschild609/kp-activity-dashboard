// Assignment email reminders for KP Knowledge. One daily pass (8am CT):
// for every published + assigned test, email each assigned person who
// hasn't passed it —
//   • "assigned"  — first time we see them assigned (once)
//   • "due soon"  — due date within DUE_SOON_DAYS (once)
//   • "overdue"   — past the due date (re-nagged every OVERDUE_RENAG_DAYS)
//
// Per-(test,person) send state lives in /knowledgeNotifications so nobody
// is emailed twice for the same milestone. Changing a test's due date
// resets its due-soon/overdue markers so the new deadline re-notifies.
//
// A manual, manager-gated twin (runKnowledgeReminders) supports a safe
// dry-run (see who WOULD be emailed), a real send, and a one-time seed
// (mark current assignments already-notified, to avoid a retroactive blast).

import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import { managerEndpoint, loadRoster } from "./shared";
import { SENDGRID_API_KEY, APP_URL, renderEmail, sendEmail } from "./email";

const DUE_SOON_DAYS = 3; // "due soon" window (inclusive of today)
const OVERDUE_RENAG_DAYS = 7; // re-send an overdue reminder at most weekly
const NOTIFS = "knowledgeNotifications";

type ReminderKind = "assigned" | "dueSoon" | "overdue";

interface Assignment {
  everyone: boolean;
  roles: string[];
  branches: string[];
  uids: string[];
  excludeUids?: string[];
  dueDate: string | null;
}

interface Taker {
  uid: string;
  name: string;
  email: string;
  branch: string | null;
  role: string | null;
}

interface NotifState {
  dueDate?: string | null;
  assignedAt?: string;
  dueSoonAt?: string;
  overdueAt?: string;
}

interface Planned {
  docId: string;
  uid: string;
  email: string;
  name: string;
  testId: string;
  testName: string;
  dueDate: string | null;
  kind: ReminderKind;
  nextState: NotifState & { updatedAt: admin.firestore.FieldValue };
}

/* Date helpers below mirror the client's roster.ts (todayIso/daysUntil/
 * formatDue) but pin America/Chicago server-side where the client uses
 * browser-local time — keep the two in sync if the semantics change.
 *
 * Today's date in KP's timezone as "YYYY-MM-DD" (en-CA yields that shape).
 * The schedule runs at 8am CT, so "today" must be the Central date. */
function chicagoToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/* Whole days from `fromIso` to `toIso` (both "YYYY-MM-DD"); UTC math avoids
 * DST drift. Negative when `toIso` is in the past relative to `fromIso`.
 * Exported for unit tests. */
export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

function fmtDue(dueDate: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function isAssigned(a: Assignment): boolean {
  return a.everyone || a.roles.length > 0 || a.branches.length > 0 || a.uids.length > 0;
}

/* Who a test's assignment resolves to — union of everyone/roles/branches/
 * people, limited to staff who can take tests. Mirrors the client's
 * resolveAssigned (src/lib/roster.ts). */
function resolveAssigned(a: Assignment, takers: Taker[]): Taker[] {
  const excluded = new Set(a.excludeUids ?? []);
  const pool = takers.filter((u) => !excluded.has(u.uid));
  if (a.everyone) return pool;
  const uids = new Set(a.uids);
  const roles = new Set(a.roles);
  const branches = new Set(a.branches);
  return pool.filter(
    (u) =>
      uids.has(u.uid) ||
      (u.role != null && roles.has(u.role)) ||
      (u.branch != null && branches.has(u.branch))
  );
}

/* ── Data loads ─────────────────────────────────────────────────── */

/** The staff who can take tests — the shared roster filtered to KP Knowledge
 *  access. (resolveAssigned only ever targets takers.) */
async function loadTakers(db: admin.firestore.Firestore): Promise<Taker[]> {
  const roster = await loadRoster(db);
  return roster
    .filter((u) => u.knowledge)
    .map((u) => ({ uid: u.uid, name: u.name, email: u.email, branch: u.branch, role: u.role }));
}

async function loadAssignedTests(
  db: admin.firestore.Firestore
): Promise<Array<{ id: string; name: string; assignment: Assignment }>> {
  const snap = await db.collection("knowledgeTests").where("isActive", "==", true).get();
  const out: Array<{ id: string; name: string; assignment: Assignment }> = [];
  for (const doc of snap.docs) {
    const a = doc.data().assignment as Assignment | undefined;
    if (a && isAssigned(a)) {
      out.push({ id: doc.id, name: (doc.data().name as string) ?? "a training", assignment: a });
    }
  }
  return out;
}

/** uid+testId keys of everyone who has PASSED a test (they're done — no nag).
 *  Projects to just the two key fields so a growing attempts collection
 *  doesn't return full result bodies. */
async function loadPassed(db: admin.firestore.Firestore): Promise<Set<string>> {
  const snap = await db
    .collection("knowledgeAttempts")
    .where("passed", "==", true)
    .select("testId", "uid")
    .get();
  const set = new Set<string>();
  for (const d of snap.docs) set.add(`${d.data().testId}__${d.data().uid}`);
  return set;
}

async function loadStates(db: admin.firestore.Firestore): Promise<Map<string, NotifState>> {
  const snap = await db.collection(NOTIFS).get();
  const map = new Map<string, NotifState>();
  for (const d of snap.docs) map.set(d.id, d.data() as NotifState);
  return map;
}

/* ── Decide what to send ────────────────────────────────────────── */

/* For one (test, person), decide which single reminder (if any) is due
 * today, and the state to persist once it's sent. At most one email per
 * person per test per run; more urgent kinds win and also record that the
 * earlier milestones are covered. */
export function decide(
  test: { id: string; name: string; assignment: Assignment },
  person: Taker,
  st: NotifState,
  today: string
): Planned | null {
  const due = test.assignment.dueDate ?? null;
  const docId = `${test.id}__${person.uid}`;
  // A changed due date resets due-soon/overdue markers so the new deadline
  // re-notifies; the "assigned" acknowledgement is kept.
  const rescheduled = (st.dueDate ?? null) !== due;
  const assignedSent = !!st.assignedAt;
  const dueSoonSent = !rescheduled && !!st.dueSoonAt;
  const overdueAt = rescheduled ? undefined : st.overdueAt;

  let kind: ReminderKind | null = null;
  if (due != null) {
    const d = daysBetween(today, due);
    if (d < 0) {
      if (!overdueAt || daysBetween(overdueAt, today) >= OVERDUE_RENAG_DAYS) kind = "overdue";
    } else if (d <= DUE_SOON_DAYS) {
      kind = !assignedSent ? "assigned" : !dueSoonSent ? "dueSoon" : null;
    } else if (!assignedSent) {
      kind = "assigned";
    }
  } else if (!assignedSent) {
    kind = "assigned";
  }
  if (!kind) return null;

  // Reconcile the full state on send so a reschedule can't leave stale markers.
  const nextState: Planned["nextState"] = {
    dueDate: due,
    assignedAt: st.assignedAt ?? today,
    dueSoonAt: kind === "dueSoon" || kind === "overdue" ? today : rescheduled ? undefined : st.dueSoonAt,
    overdueAt: kind === "overdue" ? today : rescheduled ? undefined : st.overdueAt,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  return {
    docId,
    uid: person.uid,
    email: person.email,
    name: person.name,
    testId: test.id,
    testName: test.name,
    dueDate: due,
    kind,
    nextState,
  };
}

/** Compute every reminder that should go out today. */
async function computePlan(db: admin.firestore.Firestore, today: string): Promise<Planned[]> {
  const [takers, tests, passed, states] = await Promise.all([
    loadTakers(db),
    loadAssignedTests(db),
    loadPassed(db),
    loadStates(db),
  ]);
  const plan: Planned[] = [];
  for (const test of tests) {
    for (const person of resolveAssigned(test.assignment, takers)) {
      if (passed.has(`${test.id}__${person.uid}`)) continue;
      const p = decide(test, person, states.get(`${test.id}__${person.uid}`) ?? {}, today);
      if (p) plan.push(p);
    }
  }
  return plan;
}

/* ── Render ─────────────────────────────────────────────────────── */

function emailFor(p: Planned, today: string): { subject: string; html: string } {
  const first = p.name.split(" ")[0] || "there";
  const bold = `<strong>${p.testName.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</strong>`;
  const dueTxt = p.dueDate ? fmtDue(p.dueDate) : "";
  if (p.kind === "overdue") {
    return {
      subject: `Overdue: ${p.testName}`,
      html: renderEmail({
        tone: "bad",
        heading: "This training is overdue",
        bodyLines: [`Hi ${first},`, `The training ${bold} was due ${dueTxt} and hasn't been completed yet. Please finish it as soon as you can.`],
        dueLine: `Was due ${dueTxt}`,
      }),
    };
  }
  if (p.kind === "dueSoon" && p.dueDate) {
    const d = daysBetween(today, p.dueDate);
    const when = d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
    return {
      subject: `Reminder: ${p.testName} is due ${dueTxt}`,
      html: renderEmail({
        tone: "warn",
        heading: `Training due ${when}`,
        bodyLines: [`Hi ${first},`, `A reminder that ${bold} is due ${when}. It only takes a few minutes — please complete it before the deadline.`],
        dueLine: `Due ${dueTxt}`,
      }),
    };
  }
  // assigned
  const dueLine = p.dueDate ? `Due ${dueTxt}` : null;
  const closing = p.dueDate
    ? `Please complete it by ${dueTxt}.`
    : `Please complete it when you have a few minutes.`;
  return {
    subject: `You've been assigned: ${p.testName}`,
    html: renderEmail({
      tone: "brand",
      heading: "You have a new training assigned",
      bodyLines: [`Hi ${first},`, `You've been assigned ${bold} in KP Knowledge. ${closing}`],
      dueLine,
    }),
  };
}

/* ── Send ───────────────────────────────────────────────────────── */

async function deliver(
  db: admin.firestore.Firestore,
  apiKey: string,
  plan: Planned[],
  today: string
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const p of plan) {
    const { subject, html } = emailFor(p, today);
    const ok = await sendEmail(apiKey, { email: p.email, name: p.name }, subject, html);
    if (ok) {
      sent++;
      await db.collection(NOTIFS).doc(p.docId).set(p.nextState, { merge: true });
    } else {
      failed++;
    }
  }
  return { sent, failed };
}

/* ── Scheduled daily pass ───────────────────────────────────────── */

export const knowledgeReminders = onSchedule(
  {
    schedule: "0 8 * * *",
    timeZone: "America/Chicago",
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 300,
    secrets: [SENDGRID_API_KEY],
  },
  async () => {
    const db = admin.firestore();
    const today = chicagoToday();
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      logger.warn("[knowledge-reminders] SENDGRID_API_KEY not bound — skipping");
      return;
    }
    const plan = await computePlan(db, today);
    if (plan.length === 0) {
      logger.info("[knowledge-reminders] nothing due today");
      return;
    }
    const { sent, failed } = await deliver(db, apiKey, plan, today);
    logger.info("[knowledge-reminders] done", { candidates: plan.length, sent, failed });
  }
);

/* ── Manual trigger (manager-only) ──────────────────────────────────
 * POST body/query { mode }:
 *   "dryRun" (default) — return who WOULD be emailed, send nothing
 *   "send"             — send for real + record state
 *   "seed"             — mark all current assignments already-"assigned"
 *                        (no email) so a first live run won't retro-blast
 */
export const runKnowledgeReminders = managerEndpoint(
  { timeoutSeconds: 300, memory: "512MiB", secrets: [SENDGRID_API_KEY] },
  async (req, res) => {
    const db = admin.firestore();
    const today = chicagoToday();
    const mode = (req.body?.mode ?? req.query?.mode ?? "dryRun") as string;

    if (mode === "seed") {
      const [takers, tests] = await Promise.all([loadTakers(db), loadAssignedTests(db)]);
      const states = await loadStates(db);
      let seeded = 0;
      const batch = db.batch();
      for (const test of tests) {
        for (const person of resolveAssigned(test.assignment, takers)) {
          const docId = `${test.id}__${person.uid}`;
          if (states.get(docId)?.assignedAt) continue;
          batch.set(
            db.collection(NOTIFS).doc(docId),
            {
              dueDate: test.assignment.dueDate ?? null,
              assignedAt: today,
              seeded: true, // audit-only marker; nothing reads it
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          seeded++;
        }
      }
      if (seeded > 0) await batch.commit();
      res.json({ ok: true, mode, seeded });
      return;
    }

    const plan = await computePlan(db, today);
    const preview = plan.map((p) => ({
      to: p.email,
      name: p.name,
      test: p.testName,
      kind: p.kind,
      dueDate: p.dueDate,
    }));

    if (mode !== "send") {
      res.json({ ok: true, mode: "dryRun", count: plan.length, wouldSend: preview });
      return;
    }

    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      res.status(500).json({ ok: false, error: "SENDGRID_API_KEY not bound" });
      return;
    }
    const { sent, failed } = await deliver(db, apiKey, plan, today);
    res.json({ ok: true, mode: "send", candidates: plan.length, sent, failed, appUrl: APP_URL });
  }
);

/* ── Instant notify on assignment ────────────────────────────────────
 * Fires the "assigned" email the moment a test's assignment is saved (or a
 * test goes live while already assigned) — so staff don't wait for the
 * daily 8am pass. Shares the same /knowledgeNotifications dedup, so the
 * scheduled job never re-sends what this already sent. Only genuine
 * assignment changes act (slide/metadata edits are no-ops); each newly
 * assigned person is emailed once. */
export const knowledgeAssignmentNotify = onDocumentWritten(
  {
    document: "knowledgeTests/{testId}",
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 120,
    secrets: [SENDGRID_API_KEY],
  },
  async (event) => {
    const after = event.data?.after?.data();
    if (!after) return; // deleted
    const before = event.data?.before?.data();

    const assignment = after.assignment as Assignment | undefined;
    // Reminders target published + assigned tests only (an inactive draft
    // can't be taken yet, so there's nothing to notify about).
    if (after.isActive !== true || !assignment || !isAssigned(assignment)) return;

    // Skip slide/metadata edits — act only when the assignment actually
    // changed, or the test just went live while already assigned.
    const assignmentChanged =
      JSON.stringify(before?.assignment ?? null) !== JSON.stringify(assignment);
    const becamePublished = before?.isActive !== true;
    if (!assignmentChanged && !becamePublished) return;

    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      logger.warn("[knowledge-reminders] assignment notify: SENDGRID_API_KEY not bound");
      return;
    }

    const db = admin.firestore();
    const today = chicagoToday();
    const test = {
      id: event.params.testId,
      name: (after.name as string) ?? "a training",
      assignment,
    };
    const [takers, passed, states] = await Promise.all([
      loadTakers(db),
      loadPassed(db),
      loadStates(db),
    ]);
    const plan: Planned[] = [];
    for (const person of resolveAssigned(assignment, takers)) {
      if (passed.has(`${test.id}__${person.uid}`)) continue;
      const p = decide(test, person, states.get(`${test.id}__${person.uid}`) ?? {}, today);
      if (p) plan.push(p);
    }
    if (!plan.length) return;
    const { sent, failed } = await deliver(db, apiKey, plan, today);
    logger.info("[knowledge-reminders] assignment notify", {
      testId: test.id,
      candidates: plan.length,
      sent,
      failed,
    });
  }
);
