import { createMemoryTimeStore, type TimeStore } from "@/lib/time/store";
import { createDurableTimeStore, shouldUseDurableTimeStore } from "@/lib/time/redis-store";

const g = globalThis as unknown as {
  __ppTimeStore?: TimeStore;
  __ppTimeStorePromise?: Promise<TimeStore>;
};

/** Prefer this everywhere — Redis-backed when TIME_PREVIEW / TIME_USE_REDIS. */
export async function getTimeStore(): Promise<TimeStore> {
  if (!shouldUseDurableTimeStore()) {
    if (!g.__ppTimeStore) g.__ppTimeStore = createMemoryTimeStore();
    return g.__ppTimeStore;
  }
  if (g.__ppTimeStore && g.__ppTimeStorePromise) return g.__ppTimeStorePromise;
  if (!g.__ppTimeStorePromise) {
    g.__ppTimeStorePromise = createDurableTimeStore().then((store) => {
      g.__ppTimeStore = store;
      return store;
    });
  }
  return g.__ppTimeStorePromise;
}

export function resetTimeStoreForTests() {
  g.__ppTimeStore = createMemoryTimeStore();
  g.__ppTimeStorePromise = undefined;
}
