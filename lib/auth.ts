const AUTH_SALT = "party-perfect-command-center-v1";
const MAIN_SESSION_KEY = "pp-auth-session";
const OWNER_SESSION_KEY = "pp-owner-session";
const ATTEMPT_STATE_KEY = "pp-auth-attempts";

/** Internal team password — client-side gate only (not server auth). */
const MAIN_PASSWORD = "socialbutterfly";
/** Owner / admin PIN for bookkeeping, marketing, reports. */
const OWNER_PIN = "0623";

const MAIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OWNER_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

interface StoredSession {
  token: string;
  expiresAt: number;
}

interface AttemptState {
  failures: number;
  lockedUntil?: number;
}

let cachedMainToken: string | null = null;
let cachedOwnerToken: string | null = null;

async function digestSecret(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(`${AUTH_SALT}:${value}`);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function expectedMainToken() {
  if (!cachedMainToken) {
    cachedMainToken = await digestSecret(MAIN_PASSWORD);
  }
  return cachedMainToken;
}

async function expectedOwnerToken() {
  if (!cachedOwnerToken) {
    cachedOwnerToken = await digestSecret(OWNER_PIN);
  }
  return cachedOwnerToken;
}

function readSession(key: string): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.token || !parsed.expiresAt) return null;
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(key: string, token: string, ttlMs: number) {
  if (typeof window === "undefined") return;
  const session: StoredSession = {
    token,
    expiresAt: Date.now() + ttlMs,
  };
  localStorage.setItem(key, JSON.stringify(session));
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

export async function isMainSessionValid(): Promise<boolean> {
  const session = readSession(MAIN_SESSION_KEY);
  if (!session) return false;
  return session.token === (await expectedMainToken());
}

export async function isOwnerSessionValid(): Promise<boolean> {
  const session = readSession(OWNER_SESSION_KEY);
  if (!session) return false;
  return session.token === (await expectedOwnerToken());
}

export async function signInWithPassword(password: string): Promise<boolean> {
  const lockout = getAuthLockoutMessage();
  if (lockout) return false;

  const token = await digestSecret(password.trim());
  const expected = await expectedMainToken();
  if (token !== expected) {
    registerFailedAttempt();
    return false;
  }

  clearFailedAttempts();
  writeSession(MAIN_SESSION_KEY, token, MAIN_SESSION_TTL_MS);
  return true;
}

export async function unlockOwnerWithPin(pin: string): Promise<boolean> {
  const lockout = getAuthLockoutMessage();
  if (lockout) return false;

  const normalized = pin.replace(/\D/g, "");
  if (normalized !== OWNER_PIN) {
    registerFailedAttempt();
    return false;
  }

  clearFailedAttempts();
  const token = await expectedOwnerToken();
  writeSession(OWNER_SESSION_KEY, token, OWNER_SESSION_TTL_MS);
  return true;
}

export function signOut() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(MAIN_SESSION_KEY);
  localStorage.removeItem(OWNER_SESSION_KEY);
  localStorage.removeItem("pp-user-role");
}

export function isOwnerSection(section: import("./types").NavSection) {
  return (
    section === "bookkeeping" ||
    section === "marketing" ||
    section === "reports"
  );
}
