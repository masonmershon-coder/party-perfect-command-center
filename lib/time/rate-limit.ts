/**
 * PIN lockout — durable across serverless instances.
 * Redis when configured; otherwise shared durable JSON; memory last-resort for unit tests.
 * Stores attempt timestamps + lock expiry only. Never stores PIN plaintext.
 */
import { getDurableRedis, readDurableJson, writeDurableJson } from "@/lib/durable-json";

export const TIME_PIN_MAX_FAILS = 5;
const WINDOW_MS = 5 * 60 * 1000;
const LOCKOUT_MS = 5 * 60 * 1000;
const REDIS_TTL_SEC = 15 * 60;
const TABLE_KEY = "time/pin-lockouts.json";
const REDIS_PREFIX = "pp:time:pinlock:";

type PinLockState = {
  hits: number[];
  lockUntil: number;
};

const memory = new Map<string, PinLockState>();

function prune(state: PinLockState, now: number): PinLockState {
  return {
    hits: (state.hits || []).filter((t) => now - t < WINDOW_MS),
    lockUntil: state.lockUntil || 0,
  };
}

function redisKey(key: string): string {
  return `${REDIS_PREFIX}${key}`;
}

async function loadState(key: string): Promise<PinLockState> {
  const now = Date.now();
  const redis = getDurableRedis();
  if (redis) {
    const raw = await redis.get<PinLockState | string>(redisKey(key));
    if (!raw) return { hits: [], lockUntil: 0 };
    const parsed = typeof raw === "string" ? (JSON.parse(raw) as PinLockState) : raw;
    return prune(parsed, now);
  }
  const table = await readDurableJson<Record<string, PinLockState>>(TABLE_KEY, {});
  return prune(table[key] || { hits: [], lockUntil: 0 }, now);
}

async function saveState(key: string, state: PinLockState): Promise<void> {
  const redis = getDurableRedis();
  if (redis) {
    await redis.set(redisKey(key), state, { ex: REDIS_TTL_SEC });
    return;
  }
  const table = await readDurableJson<Record<string, PinLockState>>(TABLE_KEY, {});
  const next = { ...table, [key]: state };
  // Drop expired rows so the table stays bounded.
  const now = Date.now();
  for (const [k, v] of Object.entries(next)) {
    const p = prune(v, now);
    if (p.hits.length === 0 && now >= p.lockUntil) delete next[k];
    else next[k] = p;
  }
  await writeDurableJson(TABLE_KEY, next);
}

async function deleteState(key: string): Promise<void> {
  const redis = getDurableRedis();
  if (redis) {
    await redis.del(redisKey(key));
    return;
  }
  const table = await readDurableJson<Record<string, PinLockState>>(TABLE_KEY, {});
  if (!(key in table)) return;
  const { [key]: _, ...rest } = table;
  await writeDurableJson(TABLE_KEY, rest);
}

export async function timePinAllowed(key: string): Promise<boolean> {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && now < mem.lockUntil) return false;
  const state = prune(await loadState(key), now);
  memory.set(key, state);
  if (now < state.lockUntil) return false;
  if (state.hits.length >= TIME_PIN_MAX_FAILS) {
    state.lockUntil = now + LOCKOUT_MS;
    memory.set(key, state);
    await saveState(key, state);
    return false;
  }
  return true;
}

export async function recordTimePinFailure(key: string): Promise<void> {
  const now = Date.now();
  const state = prune(await loadState(key), now);
  state.hits.push(now);
  if (state.hits.length >= TIME_PIN_MAX_FAILS) {
    state.lockUntil = now + LOCKOUT_MS;
  }
  memory.set(key, state);
  await saveState(key, state);
}

export async function clearTimePinFailures(key: string): Promise<void> {
  memory.delete(key);
  await deleteState(key);
}

export async function resetTimePinLimitForTests(): Promise<void> {
  memory.clear();
  const redis = getDurableRedis();
  if (redis) return;
  await writeDurableJson(TABLE_KEY, {});
}
