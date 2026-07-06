// Review reminders for the KP SOP Recorder (anti-staleness). One weekly pass
// (Monday 8am CT): find published SOPs whose next review date has arrived
// (nextReviewAt <= today), group them by owner, and email each owner a single
// digest of what they need to re-verify. Reuses the family SendGrid setup
// (SENDGRID_API_KEY + noreply@kpshub.app) and the KP Knowledge branding.
//
// SOPs live in the `sopRecordings` collection (written by the Cloud Run backend).
// An overdue SOP re-nags weekly until its owner opens it and clicks "Mark
// reviewed" (which pushes nextReviewAt out), so no per-SOP send-state is needed.
//
// A manual, manager-gated twin (runSopReviewReminders) supports a dry-run
// (see who WOULD be emailed) and a real send.

import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import { managerEndpoint, loadRoster } from "./shared";
import { SENDGRID_API_KEY, APP_URL, renderEmail, sendEmail } from "./email";

const COLLECTION = "sopRecordings";
const REVIEW_URL = `${APP_URL}/create`; // SOP Builder lives under the Create tab

interface DueSop {
  id: string;
  title: string;
  ownerEmail: string;
  lastVerifiedAt: string | null;
  nextReviewAt: string | null;
}

/* Today's date in KP's timezone as "YYYY-MM-DD" (matches the backend, which
 * stores review dates as plain ISO dates). The schedule runs at 8am CT. */
function chicagoToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/* Published SOPs due for review, grouped by owner email. Filtered in code (not
 * a range query) so no composite index is needed; SOPs with no nextReviewAt or
 * no owner are skipped. */
async function dueByOwner(
  db: admin.firestore.Firestore,
  today: string
): Promise<Map<string, DueSop[]>> {
  const snap = await db.collection(COLLECTION).where("status", "==", "published").get();
  const byOwner = new Map<string, DueSop[]>();
  for (const d of snap.docs) {
    const s = d.data();
    const next: string | null = s.nextReviewAt ?? null;
    const owner: string = s.ownerEmail || s.creatorEmail || "";
    if (!owner || !next || next > today) continue; // ISO dates sort lexicographically
    const sop: DueSop = {
      id: d.id,
      title: (s.title as string) || (s.task as string) || "Untitled SOP",
      ownerEmail: owner,
      lastVerifiedAt: s.lastVerifiedAt ?? null,
      nextReviewAt: next,
    };
    const list = byOwner.get(owner);
    if (list) list.push(sop);
    else byOwner.set(owner, [sop]);
  }
  return byOwner;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function emailFor(firstName: string, sops: DueSop[]): { subject: string; html: string } {
  const n = sops.length;
  const list = sops
    .map(
      (s) =>
        `• <strong>${escapeHtml(s.title)}</strong>` +
        (s.lastVerifiedAt ? ` — last verified ${s.lastVerifiedAt}` : "")
    )
    .join("<br>");
  return {
    subject: n === 1 ? "An SOP is due for review" : `${n} SOPs are due for review`,
    html: renderEmail({
      tone: "warn",
      heading: n === 1 ? "An SOP needs your review" : `${n} SOPs need your review`,
      bodyLines: [
        `Hi ${firstName},`,
        `You own the following SOP${n === 1 ? "" : "s"} in KP Knowledge. Please open ` +
          `each one, confirm the steps still match the app, then click ` +
          `<strong>Mark reviewed</strong> (or update it and re-publish):`,
        list,
      ],
      dueLine: `Due for review as of today`,
      ctaUrl: REVIEW_URL,
      ctaLabel: "Review SOPs →",
    }),
  };
}

/* First name for an owner email, from the roster where possible. */
function firstNameFor(email: string, names: Map<string, string>): string {
  const full = names.get(email.toLowerCase());
  if (full) return full.split(" ")[0];
  return email.split("@")[0] || "there";
}

async function computeAndSend(
  db: admin.firestore.Firestore,
  today: string,
  apiKey: string | undefined,
  dryRun: boolean
): Promise<{ owners: number; due: number; sent: number; failed: number; preview: unknown[] }> {
  const byOwner = await dueByOwner(db, today);
  const roster = await loadRoster(db);
  const names = new Map(roster.map((r) => [r.email.toLowerCase(), r.name]));

  let due = 0;
  let sent = 0;
  let failed = 0;
  const preview: unknown[] = [];
  for (const [owner, sops] of byOwner) {
    due += sops.length;
    const first = firstNameFor(owner, names);
    preview.push({ to: owner, count: sops.length, sops: sops.map((s) => s.title) });
    if (dryRun) continue;
    const { subject, html } = emailFor(first, sops);
    const ok = apiKey ? await sendEmail(apiKey, { email: owner, name: names.get(owner.toLowerCase()) }, subject, html) : false;
    if (ok) sent += sops.length;
    else failed += sops.length;
  }
  return { owners: byOwner.size, due, sent, failed, preview };
}

/* ── Scheduled weekly pass ──────────────────────────────────────────── */

export const sopReviewReminders = onSchedule(
  {
    schedule: "0 8 * * 1", // Mondays, 8am
    timeZone: "America/Chicago",
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 120,
    secrets: [SENDGRID_API_KEY],
  },
  async () => {
    const db = admin.firestore();
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      logger.warn("[sop-review-reminders] SENDGRID_API_KEY not bound — skipping");
      return;
    }
    const res = await computeAndSend(db, chicagoToday(), apiKey, false);
    if (res.due === 0) logger.info("[sop-review-reminders] nothing due");
    else logger.info("[sop-review-reminders] done", res);
  }
);

/* ── Manual trigger (manager-only) ──────────────────────────────────
 * POST { mode }:  "dryRun" (default) — who WOULD be emailed, send nothing
 *                 "send"             — send for real
 */
export const runSopReviewReminders = managerEndpoint(
  { timeoutSeconds: 120, memory: "256MiB", secrets: [SENDGRID_API_KEY] },
  async (req, res) => {
    const db = admin.firestore();
    const today = chicagoToday();
    const mode = (req.body?.mode ?? req.query?.mode ?? "dryRun") as string;
    const dryRun = mode !== "send";
    const apiKey = dryRun ? undefined : process.env.SENDGRID_API_KEY;
    if (!dryRun && !apiKey) {
      res.status(500).json({ ok: false, error: "SENDGRID_API_KEY not bound" });
      return;
    }
    const r = await computeAndSend(db, today, apiKey, dryRun);
    res.json({ ok: true, mode: dryRun ? "dryRun" : "send", ...r });
  }
);
