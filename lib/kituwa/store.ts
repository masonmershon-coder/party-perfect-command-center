import { readDurableJson, writeDurableJson, durableStoreMode } from "@/lib/durable-json";
import { isVercelRuntime } from "@/lib/data-dir";
import { emptyKituwaState, type KituwaState } from "@/lib/kituwa/types";

const KEY = "kituwa/state.json";

const memory = new Map<string, KituwaState>();

export function kituwaStoreMode() {
  if (process.env.KITUWA_STORE === "memory") return "memory" as const;
  return durableStoreMode();
}

export async function loadKituwaState(): Promise<KituwaState> {
  if (process.env.KITUWA_STORE === "memory") {
    return memory.get(KEY) ?? emptyKituwaState();
  }
  const state = await readDurableJson<KituwaState>(KEY, emptyKituwaState());
  if (!state || state.version !== 1) return emptyKituwaState();
  return state;
}

export async function saveKituwaState(state: KituwaState): Promise<KituwaState> {
  const next = { ...state, updatedAt: new Date().toISOString() };
  if (process.env.KITUWA_STORE === "memory") {
    memory.set(KEY, next);
    return next;
  }
  if (isVercelRuntime() && durableStoreMode() === "ephemeral") {
    throw new Error(
      "Kituwa durable storage is not configured. Set BLOB_READ_WRITE_TOKEN or Upstash Redis on the kituwa Vercel project.",
    );
  }
  await writeDurableJson(KEY, next);
  return next;
}

export async function mutateKituwaState(
  fn: (state: KituwaState) => KituwaState | Promise<KituwaState>,
): Promise<KituwaState> {
  const current = await loadKituwaState();
  return saveKituwaState(await fn(current));
}
