import { isAiCoreConfigured } from "./ai-core";
import type { IntakeDeps } from "./mike-intake";
import { PostgresMikeIntakeStore, isMikeIntakeDbConfigured } from "./mike-intake-pg";
import {
  SupabaseMikeIntakeStorage,
  isMikeIntakeStorageConfigured,
} from "./supabase-storage";

export function isMikeRemoteIntakeConfigured(): boolean {
  return isAiCoreConfigured() && isMikeIntakeDbConfigured() && isMikeIntakeStorageConfigured();
}

export function productionIntakeDeps(): IntakeDeps {
  return {
    store: new PostgresMikeIntakeStore(),
    storage: new SupabaseMikeIntakeStorage(),
    configured: isMikeRemoteIntakeConfigured(),
  };
}
