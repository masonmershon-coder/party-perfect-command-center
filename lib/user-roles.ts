export type UserRole = "owner" | "employee";

export const USER_ROLE_STORAGE_KEY = "pp-user-role";

export const CORE_AGENT_SLUGS = ["mike-operations", "madison-comms"] as const;

export function readUserRole(): UserRole {
  if (typeof window === "undefined") return "owner";
  try {
    const stored = localStorage.getItem(USER_ROLE_STORAGE_KEY);
    return stored === "employee" ? "employee" : "owner";
  } catch {
    return "owner";
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
    "inventory",
  ]);
  if (role === "owner") return true;
  return employeeAllowed.has(section);
}
