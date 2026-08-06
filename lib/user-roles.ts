export type UserRole = "owner" | "employee";

export const USER_ROLE_STORAGE_KEY = "pp-user-role";

export const CORE_AGENT_SLUGS = ["mike-operations", "madison-comms"] as const;

export function readUserRole(): UserRole {
  if (typeof window === "undefined") return "employee";
  try {
    const stored = localStorage.getItem(USER_ROLE_STORAGE_KEY);
    if (stored === "owner") return "owner";
    return "employee";
  } catch {
    return "employee";
  }
}

export function writeUserRole(role: UserRole) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(USER_ROLE_STORAGE_KEY, role);
  } catch {
    // ignore
  }
}

export function clearStoredUserRole() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(USER_ROLE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function roleLabel(role: UserRole) {
  return role === "owner" ? "Owner" : "Employee";
}

export function canAccessSection(
  role: UserRole,
  section: import("./types").NavSection,
) {
  const employeeAllowed = new Set([
    "dashboard",
    "agents",
    "tasks",
    "emails",
    "social",
    "design",
    "inventory",
    "hiring",
  ]);
  if (role === "owner") return true;
  return employeeAllowed.has(section);
}

/** Revenue, AR, rates, bills — owner PIN session only. */
export function canViewFinancials(role: UserRole) {
  return role === "owner";
}
