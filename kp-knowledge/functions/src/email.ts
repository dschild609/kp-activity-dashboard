// SendGrid email for KP Knowledge — reuses the family's SENDGRID_API_KEY
// secret (raw REST, no SDK) and the noreply@kpshub.app verified sender.
// KP Knowledge branding: orange (#EA580C) header + graduation-cap wordmark.

import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";

export const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");

const FROM = { email: "noreply@kpshub.app", name: "KP Knowledge" };
export const APP_URL = "https://knowledge.kpshub.app";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Tone accents the status chip + due line by urgency. */
export type EmailTone = "brand" | "warn" | "bad";
const TONE: Record<EmailTone, { chipBg: string; chipText: string; label: string }> = {
  brand: { chipBg: "#fff2e8", chipText: "#c2410c", label: "Assigned" },
  warn: { chipBg: "#fef3c7", chipText: "#92400e", label: "Due soon" },
  bad: { chipBg: "#fee2e2", chipText: "#b91c1c", label: "Overdue" },
};

/* Build a KP Knowledge–branded HTML email. `bodyLines` become paragraphs;
 * `dueLine` (optional) renders as an emphasized, tone-colored line. */
export function renderEmail(args: {
  tone: EmailTone;
  heading: string;
  bodyLines: string[];
  dueLine?: string | null;
}): string {
  const tone = TONE[args.tone];
  const paras = args.bodyLines
    .map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px;color:#0b141b;">${l}</p>`)
    .join("");
  const due = args.dueLine
    ? `<p style="font-size:14px;font-weight:700;margin:0 0 16px;color:${tone.chipText};">${escapeHtml(
        args.dueLine
      )}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#ea580c;color:#fff;padding:16px 22px;border-radius:12px 12px 0 0;">
      <div style="font-size:17px;font-weight:800;letter-spacing:-0.01em;">🎓 KP Knowledge</div>
    </div>
    <div style="background:#fff;padding:24px 22px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
      <span style="display:inline-block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;background:${tone.chipBg};color:${tone.chipText};padding:4px 10px;border-radius:999px;margin-bottom:14px;">${tone.label}</span>
      <h1 style="font-size:20px;font-weight:800;margin:0 0 14px;color:#0b141b;letter-spacing:-0.02em;">${escapeHtml(
        args.heading
      )}</h1>
      ${paras}
      ${due}
      <a href="${APP_URL}" style="display:inline-block;background:#ea580c;color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:10px;margin-top:4px;">Open KP Knowledge →</a>
      <p style="font-size:12px;color:#6b7280;margin:22px 0 0;border-top:1px solid #eef0f3;padding-top:14px;">
        You're receiving this because this training is assigned to you in KP Knowledge. Questions? Contact your admin.
      </p>
    </div>
  </div>
</body></html>`;
}

/* Send one email. Returns true on a 2xx from SendGrid, false otherwise
 * (never throws — a bad send must not abort the batch). Bolding in body
 * lines is the caller's responsibility; heading/dueLine are escaped. */
export async function sendEmail(
  apiKey: string,
  to: { email: string; name?: string | null },
  subject: string,
  html: string
): Promise<boolean> {
  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to.email, name: to.name ?? undefined }] }],
        from: FROM,
        subject,
        content: [{ type: "text/html", value: html }],
      }),
    });
    if (!res.ok) {
      logger.warn("[knowledge-email] SendGrid rejected", {
        to: to.email,
        status: res.status,
        detail: await res.text().catch(() => ""),
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn("[knowledge-email] send failed", {
      to: to.email,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
