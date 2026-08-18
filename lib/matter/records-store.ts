import { readDurableJson, writeDurableJson, durableStoreMode } from "@/lib/durable-json";
import { isVercelRuntime } from "@/lib/data-dir";
import {
  emptyMatterRecordsStore,
  type MatterRecordsStore,
} from "@/lib/matter/kituwa-contract-types";

const KEY = "kituwa/records-v2.json";
const memory = { store: emptyMatterRecordsStore() };

export function matterRecordsStoreMode() {
  if (process.env.KITUWA_STORE === "memory") return "memory" as const;
  return durableStoreMode();
}

export async function loadMatterRecords(): Promise<MatterRecordsStore> {
  if (process.env.KITUWA_STORE === "memory") return structuredClone(memory.store);
  const raw = await readDurableJson<MatterRecordsStore>(KEY, emptyMatterRecordsStore());
  if (!raw || raw.version !== 2) return emptyMatterRecordsStore();
  return raw;
}

export async function saveMatterRecords(store: MatterRecordsStore): Promise<MatterRecordsStore> {
  const next = { ...store, updatedAt: new Date().toISOString() };
  if (process.env.KITUWA_STORE === "memory") {
    memory.store = next;
    return next;
  }
  if (isVercelRuntime() && matterRecordsStoreMode() === "ephemeral") {
    throw new Error("Kituwa durable records storage is not configured.");
  }
  await writeDurableJson(KEY, next);
  return next;
}

export async function mutateMatterRecords(
  fn: (s: MatterRecordsStore) => MatterRecordsStore | Promise<MatterRecordsStore>,
): Promise<MatterRecordsStore> {
  return saveMatterRecords(await fn(await loadMatterRecords()));
}
