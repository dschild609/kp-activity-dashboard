export const HUB_ROLES = [
  "super_admin",
  "area_manager",
  "ops_manager",
  "branch_manager",
  "recruiter",
] as const;

export type HubRole = (typeof HUB_ROLES)[number];
export type UserRole = HubRole | "pending" | null;

export const BRANCHES = [
  "ARL", "ATL", "CARR", "DENT", "DUNC", "FORT", "GARL",
  "GRAN", "HNC", "HOU", "IRV", "KC", "MEM", "NHOU", "PAS", "PHX", "SAG",
] as const;

export type BranchCode = (typeof BRANCHES)[number];

export function isAuthorizedRole(role: UserRole): boolean {
  return role !== null && role !== "pending";
}

/* Knowledge admin = manage tests/questions, view all results, reset attempts.
 * Managers get results visibility without test-editing rights. */
export function canManageTests(role: UserRole): boolean {
  return role === "super_admin" || role === "ops_manager";
}

export function canViewAllResults(role: UserRole): boolean {
  return (
    role === "super_admin" ||
    role === "ops_manager" ||
    role === "area_manager" ||
    role === "branch_manager"
  );
}

export function isKnowledgeAdmin(role: UserRole): boolean {
  return canManageTests(role) || canViewAllResults(role);
}
