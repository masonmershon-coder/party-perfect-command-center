const hits = new Map<string, number[]>();
const lockUntil = new Map<string, number>();

export const TIME_PIN_MAX_FAILS = 5;
const WINDOW_MS = 5 * 60 * 1000;
const LOCKOUT_MS = 5 * 60 * 1000;

export function timePinAllowed(key: string): boolean {
  const now = Date.now();
  const locked = lockUntil.get(key) || 0;
  if (now < locked) return false;
  const cuts = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (cuts.length >= TIME_PIN_MAX_FAILS) {
    hits.set(key, cuts);
    lockUntil.set(key, now + LOCKOUT_MS);
    return false;
  }
  return true;
}

export function recordTimePinFailure(key: string) {
  const now = Date.now();
  const cuts = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  cuts.push(now);
  hits.set(key, cuts);
  if (cuts.length >= TIME_PIN_MAX_FAILS) {
    lockUntil.set(key, now + LOCKOUT_MS);
  }
}

export function clearTimePinFailures(key: string) {
  hits.delete(key);
  lockUntil.delete(key);
}

export function resetTimePinLimitForTests() {
  hits.clear();
  lockUntil.clear();
}
