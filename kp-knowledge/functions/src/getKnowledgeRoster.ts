// Returns a minimal staff roster for KP Knowledge assignment + completion
// tracking. The /users collection is admin-only at the rules layer, so
// non-admin managers (canManageKnowledgeTests) can't read it client-side —
// this function does, via the Admin SDK, and returns only the fields the
// assignment UI needs (no sensitive PII beyond name/email/branch/role).

import * as admin from "firebase-admin";
import { managerEndpoint, loadRoster } from "./shared";

export const getKnowledgeRoster = managerEndpoint(
  { timeoutSeconds: 60, memory: "256MiB" },
  async (_req, res) => {
    const users = await loadRoster(admin.firestore());
    res.json({ ok: true, users });
  }
);
