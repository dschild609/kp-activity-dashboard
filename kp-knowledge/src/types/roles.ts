/* Role vocabulary comes from the admin console (role_new on /users, with
 * legacy hubRole fallback) — kp-shared/appAccess.ts is the source of truth
 * for the full list. This app only distinguishes a few tiers. */
export type UserRole = string | null;

export function isSuperAdmin(role: UserRole): boolean {
  return role === "super_admin";
}

/* Manager tier that may create/edit/remove tests by role alone (the
 * per-user canManageKnowledgeTests flag grants the same ability). Mirrors
 * MANAGER_ROLES in functions/src/shared.ts — keep in sync. */
export function canManageByRole(role: UserRole): boolean {
  return role === "super_admin" || role === "operations_manager" || role === "ops_manager";
}

/* Roles that see everyone's results even without manage rights */
export function canViewResultsByRole(role: UserRole): boolean {
  return (
    canManageByRole(role) ||
    role === "area_manager" ||
    role === "branch_manager" ||
    role === "recruiting_manager"
  );
}
