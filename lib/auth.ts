/**
 * Client auth helpers — talk to /api/auth/session (httpOnly cookie).
 * Passwords/PINs are NEVER embedded in the client bundle.
 */

const ATTEMPT_STATE_KEY = "pp-auth-attempts";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

interface AttemptState {
  failures: number;
  lockedUntil?: number;
}

function readAttemptState(): AttemptState {
  if (typeof window === "undefined") return { failures: 0 };
  try {
    const raw = localStorage.getItem(ATTEMPT_STATE_KEY);
    if (!raw) return { failures: 0 };
    return JSON.parse(raw) as AttemptState;
  } catch {
    return { failures: 0 };
  }
}

function writeAttemptState(state: AttemptState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ATTEMPT_STATE_KEY, JSON.stringify(state));
}

export function getAuthLockoutMessage(): string | null {
  const state = readAttemptState();
  if (!state.lockedUntil || Date.now() >= state.lockedUntil) return null;
  const minutes = Math.ceil((state.lockedUntil - Date.now()) / 60_000);
  return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

function registerFailedAttempt() {
  const state = readAttemptState();
  const failures = state.failures + 1;
  if (failures >= MAX_FAILED_ATTEMPTS) {
    writeAttemptState({ failures: 0, lockedUntil: Date.now() + LOCKOUT_MS });
    return;
  }
  writeAttemptState({ failures });
}

function clearFailedAttempts() {
  writeAttemptState({ failures: 0 });
}

export type SessionInfo = {
  authenticated: boolean;
  role?: "employee" | "owner";
  expiresAt?: number;
};

export async function fetchAuthSession(): Promise<SessionInfo> {
  try {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    if (!res.ok) return { authenticated: false };
    return (await res.json()) as SessionInfo;
  } catch {
    return { authenticated: false };
  }
}

export async function isMainSessionValid(): Promise<boolean> {
  const s = await fetchAuthSession();
  return Boolean(s.authenticated);
}

export async function isOwnerSessionValid(): Promise<boolean> {
  const s = await fetchAuthSession();
  return s.authenticated === true && s.role === "owner";
}

export async function signInWithPassword(password: string): Promise<boolean> {
  const lockout = getAuthLockoutMessage();
  if (lockout) return false;

  const res = await fetch("/api/auth/session", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", password }),
  });
  if (!res.ok) {
    registerFailedAttempt();
    return false;
  }
  clearFailedAttempts();
  return true;
}

export async function unlockOwnerWithPin(pin: string): Promise<boolean> {
  const lockout = getAuthLockoutMessage();
  if (lockout) return false;

  const res = await fetch("/api/auth/session", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "owner", pin }),
  });
  if (!res.ok) {
    registerFailedAttempt();
    return false;
  }
  clearFailedAttempts();
  return true;
}

export async function signOut() {
  try {
    await fetch("/api/auth/session", {
      method: "DELETE",
      credentials: "include",
    });
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") {
    localStorage.removeItem(ATTEMPT_STATE_KEY);
    localStorage.removeItem("pp-user-role");
    localStorage.removeItem("pp-auth-session");
    localStorage.removeItem("pp-owner-session");
  }
}

export function isOwnerSection(section: import("./types").NavSection) {
  return (
    section === "bookkeeping" ||
    section === "marketing" ||
    section === "reports" ||
    section === "security" ||
    section === "ai_cost"
  );
}
