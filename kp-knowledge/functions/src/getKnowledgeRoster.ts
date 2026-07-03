// Returns a minimal staff roster for KP Knowledge assignment + completion
// tracking. The /users collection is admin-only at the rules layer, so
// non-admin managers (canManageKnowledgeTests) can't read it client-side —
// this function does, via the Admin SDK, and returns only the fields the
// assignment UI needs (no sensitive PII beyond name/email/branch/role).

import * as admin from "firebase-admin";
import { managerEndpoint } from "./shared";

// Legacy role spellings → canonical, so targeting by role matches every doc.
const ROLE_ALIASES: Record<string, string> = {
  ops_manager: "operations_manager",
};

export const getKnowledgeRoster = managerEndpoint(
  { timeoutSeconds: 60, memory: "256MiB" },
  async (_req, res) => {
    const snap = await admin.firestore().collection("users").get();
    const users = snap.docs
      .map((d) => {
        const f = d.data();
        const rawRole: string | null =
          f.role_new ?? f.hubRole ?? (f.role === "admin" ? "super_admin" : null);
        const role = rawRole ? (ROLE_ALIASES[rawRole] ?? rawRole) : null;
        return {
          uid: d.id,
          name: (f.displayName as string) ?? (f.email as string) ?? "Unknown",
          email: (f.email as string) ?? "",
          branch: (f.branch as string) ?? null,
          role,
          // Can this user take tests at all? (assignment only counts people
          // who have KP Knowledge access.)
          knowledge: f.appAccess?.knowledge === true || f.role === "admin",
        };
      })
      // Only real staff accounts — must have an email and some access
      .filter((u) => u.email);
    res.json({ ok: true, users });
  }
);
