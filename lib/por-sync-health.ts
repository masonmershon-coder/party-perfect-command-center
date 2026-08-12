import { readDurableJson, writeDurableJson } from "./durable-json";
import { getReservations } from "./por-availability";
import { getPorCatalog } from "./por-catalog";
import { getCrmMeta } from "./por-crm";
import {
  POR_SYNC_STALE_MS,
  ageMsFromSyncedAt,
  formatSyncedAgo,
} from "./por-freshness";
import { getIngestMeta } from "./product-image-cache";
import { isValidTransactionPoolerUri } from "./supabase-probe";
import { getPorSnapshot, isPorSyncConfigured } from "./por-snapshot";
import type {
  PorSyncHealthReport,
  PorSyncTarget,
  PorSyncTargetHealth,
} from "./types";

export const POR_SYNC_HEALTH_KEY = "por-sync-health.json";

export const POR_SYNC_TARGETS: {
  id: PorSyncTarget;
  path: string;
  label: string;
  windowMs: number;
}[] = [
  {
    id: "snapshot",
    path: "/api/por/sync",
    label: "Ops snapshot",
    windowMs: POR_SYNC_STALE_MS,
  },
  {
    id: "catalog",
    path: "/api/por/sync/catalog",
    label: "Catalog",
    windowMs: POR_SYNC_STALE_MS,
  },
  {
    id: "catalog-images",
    path: "/api/por/sync/catalog-images",
    label: "Catalog images",
    windowMs: POR_SYNC_STALE_MS * 3,
  },
  {
    id: "reservations",
    path: "/api/por/sync/reservations",
    label: "Reservations",
    windowMs: POR_SYNC_STALE_MS,
  },
  {
    id: "crm",
    path: "/api/por/sync/crm",
    label: "CRM",
    windowMs: POR_SYNC_STALE_MS,
  },
  {
    id: "postgres",
    path: "/api/por/sync/postgres",
    label: "Postgres mirror",
    windowMs: POR_SYNC_STALE_MS,
  },
];

type TargetRecord = {
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
};

type HealthFile = {
  version: 1;
  targets: Partial<Record<PorSyncTarget, TargetRecord>>;
};

function emptyFile(): HealthFile {
  return { version: 1, targets: {} };
}

function clipError(message: string) {
  return message.replace(/\s+/g, " ").trim().slice(0, 240);
}

function isPostgresUriConfigured() {
  return isValidTransactionPoolerUri(process.env.DATABASE_URL);
}

async function readHealthFile(): Promise<HealthFile> {
  const raw = await readDurableJson<HealthFile>(POR_SYNC_HEALTH_KEY, emptyFile());
  if (!raw || raw.version !== 1 || typeof raw.targets !== "object") {
    return emptyFile();
  }
  return raw;
}

async function patchTarget(
  target: PorSyncTarget,
  patch: Partial<TargetRecord>,
): Promise<void> {
  try {
    const file = await readHealthFile();
    const prev = file.targets[target] ?? {
      lastSuccessAt: null,
      lastErrorAt: null,
      lastError: null,
    };
    file.targets[target] = { ...prev, ...patch };
    await writeDurableJson(POR_SYNC_HEALTH_KEY, file);
  } catch (error) {
    console.error(
      "[por-sync-health] record failed",
      target,
      error instanceof Error ? error.message : error,
    );
  }
}

export async function recordPorSyncSuccess(target: PorSyncTarget): Promise<void> {
  await patchTarget(target, { lastSuccessAt: new Date().toISOString() });
}

export async function recordPorSyncError(
  target: PorSyncTarget,
  error: string,
): Promise<void> {
  await patchTarget(target, {
    lastErrorAt: new Date().toISOString(),
    lastError: clipError(error) || "Unknown sync error",
  });
}

function laterIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export async function getPorSyncHealth(): Promise<PorSyncHealthReport> {
  const [file, snapshot, catalog, reservations, crmMeta, ingestMeta] =
    await Promise.all([
    readHealthFile(),
    getPorSnapshot(),
    getPorCatalog(),
    getReservations(),
    getCrmMeta(),
    getIngestMeta(),
  ]);

  const dataSuccess: Record<PorSyncTarget, string | null> = {
    snapshot: snapshot?.syncedAt ?? null,
    catalog: catalog.syncedAt || null,
    "catalog-images": ingestMeta.lastRunAt ?? null,
    reservations: reservations.syncedAt || null,
    crm: crmMeta?.syncedAt ?? null,
    postgres: null,
  };

  const postgresConfigured = isPostgresUriConfigured();
  const targets: PorSyncTargetHealth[] = POR_SYNC_TARGETS.map((def) => {
    const recorded = file.targets[def.id];
    const lastSuccessAt = laterIso(
      recorded?.lastSuccessAt ?? null,
      dataSuccess[def.id],
    );
    const ageMs = ageMsFromSyncedAt(lastSuccessAt);
    const configured =
      def.id === "postgres"
        ? isPorSyncConfigured() && postgresConfigured
        : isPorSyncConfigured();
    const overdue =
      configured &&
      (lastSuccessAt == null ||
        ageMs == null ||
        ageMs > def.windowMs);

    return {
      id: def.id,
      path: def.path,
      label: def.label,
      configured,
      lastSuccessAt,
      lastErrorAt: recorded?.lastErrorAt ?? null,
      lastError: recorded?.lastError ?? null,
      ageMs,
      ageLabel: lastSuccessAt ? formatSyncedAgo(ageMs) : null,
      windowMs: def.windowMs,
      overdue,
    };
  });

  return {
    checkedAt: new Date().toISOString(),
    syncConfigured: isPorSyncConfigured(),
    targets,
    overdueCount: targets.filter((t) => t.overdue).length,
  };
}

/** True when DATABASE_URL looks like a Postgres URI (not a placeholder). */
export function isPorPostgresUriConfigured() {
  return isPostgresUriConfigured();
}
