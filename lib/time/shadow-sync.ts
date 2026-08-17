/**
 * Shadow Mode sync: Square → PP Time (one-way). Deterministic — no LLM.
 * Preserves PP corrections: never overwrites employeeCorrectionId / pending_correction.
 */
import { createHash, randomUUID } from "node:crypto";
import type { TimeStore } from "@/lib/time/store";
import { emptyShiftFields } from "@/lib/time/store";
import { blankPunchEvidence } from "@/lib/time/types";
import { lunchSeconds, paidSecondsForShift } from "@/lib/time/hours";
import {
  listTeamMembers,
  searchOpenTimecards,
  searchTimecardsUpdatedSince,
  squareLaborConfig,
  type SquareTimecard,
} from "@/lib/time/square-labor";

export type ShadowSyncResult = {
  ok: boolean;
  method: "square_labor_api";
  attemptedAt: string;
  configured: boolean;
  missingEnv: string[];
  error: string | null;
  statusCode: number | null;
  imported: number;
  updated: number;
  openShifts: number;
  skippedConflict: number;
  employeesSeen: number;
  checkpoint: string | null;
  health: "HEALTHY" | "DELAYED" | "FAILED" | "NOT_CONFIGURED";
};

function sourceShiftId(timecardId: string): string {
  // Stable UUID-ish id derived from Square timecard id (dedupe across syncs).
  const hex = createHash("sha256").update(`square-tc:${timecardId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function unpaidBreak(tc: SquareTimecard): { start: string | null; end: string | null } {
  const b = (tc.breaks || []).find((x) => x.start_at) || (tc.breaks || [])[0];
  return { start: b?.start_at || null, end: b?.end_at || null };
}

export async function runSquareShadowSync(store: TimeStore): Promise<ShadowSyncResult> {
  const attemptedAt = new Date().toISOString();
  const cfg = squareLaborConfig();
  const settings = await store.getSettings();

  if (!cfg.configured) {
    await store.upsertSettings({
      squareSyncHealth: "NOT_CONFIGURED",
      squareLastAttemptedSyncAt: attemptedAt,
      squareLastError: `Missing ${cfg.missing.join(", ")}`,
      shadowMode: true,
    });
    return {
      ok: false,
      method: "square_labor_api",
      attemptedAt,
      configured: false,
      missingEnv: cfg.missing,
      error: `Missing ${cfg.missing.join(", ")}`,
      statusCode: null,
      imported: 0,
      updated: 0,
      openShifts: 0,
      skippedConflict: 0,
      employeesSeen: 0,
      checkpoint: settings.squareLastCheckpoint,
      health: "NOT_CONFIGURED",
    };
  }

  await store.upsertSettings({
    squareLastAttemptedSyncAt: attemptedAt,
    shadowMode: true,
  });

  const team = await listTeamMembers();
  const nameByTm = new Map<string, { first: string; last: string }>();
  if (team.ok) {
    for (const m of team.members) {
      nameByTm.set(m.id, {
        first: (m.given_name || "").trim(),
        last: (m.family_name || "").trim(),
      });
    }
  }

  const employees = await store.listEmployees();
  const byName = new Map(
    employees.map((e) => [
      `${e.firstName} ${e.lastName}`.trim().toLowerCase(),
      e,
    ]),
  );

  const updated = await searchTimecardsUpdatedSince({
    updatedAfterIso: settings.squareLastCheckpoint,
  });
  const open = await searchOpenTimecards();

  if (!updated.ok) {
    const health = updated.status === 401 || updated.status === 403 ? "FAILED" : "DELAYED";
    await store.upsertSettings({
      squareSyncHealth: health,
      squareLastError: updated.error,
      squareLastAttemptedSyncAt: attemptedAt,
    });
    return {
      ok: false,
      method: "square_labor_api",
      attemptedAt,
      configured: true,
      missingEnv: [],
      error: updated.error,
      statusCode: updated.status,
      imported: 0,
      updated: 0,
      openShifts: 0,
      skippedConflict: 0,
      employeesSeen: nameByTm.size,
      checkpoint: settings.squareLastCheckpoint,
      health,
    };
  }

  const byId = new Map<string, SquareTimecard>();
  for (const t of updated.timecards) byId.set(t.id, t);
  if (open.ok) for (const t of open.timecards) byId.set(t.id, t);

  let imported = 0;
  let updatedCount = 0;
  let skippedConflict = 0;
  let openShifts = 0;
  let latestUpdated: string | null = settings.squareLastCheckpoint;

  for (const tc of byId.values()) {
    if (tc.status === "OPEN") openShifts += 1;
    if (tc.updated_at && (!latestUpdated || tc.updated_at > latestUpdated)) {
      latestUpdated = tc.updated_at;
    }
    if (!tc.start_at) continue;

    const names = tc.team_member_id ? nameByTm.get(tc.team_member_id) : null;
    const identity = names
      ? `${names.first} ${names.last}`.trim().toLowerCase()
      : "";
    const employee = identity ? byName.get(identity) : null;
    if (!employee) continue;

    const shiftId = sourceShiftId(tc.id);
    const existing = await store.getShift(shiftId);
    if (
      existing &&
      (existing.employeeCorrectionId ||
        existing.status === "pending_correction" ||
        existing.closeKind === "system_pending_correction")
    ) {
      // Square changed under a PP adjustment — do not silently overwrite.
      if (
        tc.updated_at &&
        existing.endAt &&
        tc.end_at &&
        tc.end_at !== existing.endAt
      ) {
        skippedConflict += 1;
        await store.appendAudit({
          at: attemptedAt,
          actor: "square-sync",
          action: "SYNC_CONFLICT",
          target: shiftId,
          detail: `Square timecard ${tc.id} changed after PP adjustment`,
        });
      }
      continue;
    }

    const lunch = unpaidBreak(tc);
    const clockOut = tc.end_at || null;
    const status =
      tc.status === "OPEN"
        ? lunch.start && !lunch.end
          ? "on_lunch"
          : "open"
        : "closed";

    const shift = {
      id: shiftId,
      employeeId: employee.id,
      startAt: tc.start_at,
      endAt: clockOut,
      lunchStartAt: lunch.start,
      lunchEndAt: lunch.end,
      status: status as "open" | "on_lunch" | "closed",
      paidSeconds: clockOut
        ? paidSecondsForShift({
            startAt: tc.start_at,
            endAt: clockOut,
            lunchStartAt: lunch.start,
            lunchEndAt: lunch.end,
          })
        : null,
      lunchSeconds: lunchSeconds({ lunchStartAt: lunch.start, lunchEndAt: lunch.end }),
      source: "import" as const,
      payPeriodId: null,
      importedRegularHours: null,
      importedOvertimeHours: null,
      importedDoubletimeHours: null,
      ...emptyShiftFields(),
      closeKind: (clockOut ? "employee" : "none") as "employee" | "none",
      hoursAuthority: "EMPLOYEE_CONFIRMED" as const,
    };

    await store.upsertShift(shift);
    if (existing) updatedCount += 1;
    else imported += 1;

    const punches = [
      blankPunchEvidence({
        id: randomUUID(),
        employeeId: employee.id,
        type: "clock_in",
        occurredAt: tc.start_at,
        ingestedAt: attemptedAt,
        geofenceOk: false,
        geofenceReason: "import",
        gpsPermission: "import",
        source: "import",
        idempotencyKey: `square:tc:${tc.id}:in`,
        shiftId,
        deviceHint: "square-labor-api",
      }),
    ];
    if (lunch.start) {
      punches.push(
        blankPunchEvidence({
          ...punches[0],
          id: randomUUID(),
          type: "lunch_start",
          occurredAt: lunch.start,
          idempotencyKey: `square:tc:${tc.id}:lunch_start`,
        }),
      );
    }
    if (lunch.end) {
      punches.push(
        blankPunchEvidence({
          ...punches[0],
          id: randomUUID(),
          type: "lunch_end",
          occurredAt: lunch.end,
          idempotencyKey: `square:tc:${tc.id}:lunch_end`,
        }),
      );
    }
    if (clockOut) {
      punches.push(
        blankPunchEvidence({
          ...punches[0],
          id: randomUUID(),
          type: "clock_out",
          occurredAt: clockOut,
          idempotencyKey: `square:tc:${tc.id}:out`,
        }),
      );
    }
    for (const p of punches) await store.insertPunch(p);
  }

  await store.upsertSettings({
    squareSyncHealth: "HEALTHY",
    squareLastSuccessfulSyncAt: attemptedAt,
    squareLastAttemptedSyncAt: attemptedAt,
    squareLastError: null,
    squareLastCheckpoint: latestUpdated,
    squareEmployeesSynced: nameByTm.size,
    squareShiftsSynced: byId.size,
    squareOpenShifts: openShifts,
    squareConflicts: (settings.squareConflicts || 0) + skippedConflict,
    shadowMode: true,
    liveSyncStartedAt: settings.liveSyncStartedAt || attemptedAt,
  });

  await store.appendAudit({
    at: attemptedAt,
    actor: "square-sync",
    action: "square.shadow_sync",
    target: latestUpdated || "none",
    detail: `imported=${imported} updated=${updatedCount} open=${openShifts} conflicts=${skippedConflict}`,
  });

  return {
    ok: true,
    method: "square_labor_api",
    attemptedAt,
    configured: true,
    missingEnv: [],
    error: null,
    statusCode: null,
    imported,
    updated: updatedCount,
    openShifts,
    skippedConflict,
    employeesSeen: nameByTm.size,
    checkpoint: latestUpdated,
    health: "HEALTHY",
  };
}

export function shadowSyncStatusPayload(settings: Awaited<ReturnType<TimeStore["getSettings"]>>) {
  const cfg = squareLaborConfig();
  const last = settings.squareLastSuccessfulSyncAt
    ? Date.parse(settings.squareLastSuccessfulSyncAt)
    : 0;
  const stale =
    settings.squareSyncHealth === "HEALTHY" &&
    last > 0 &&
    Date.now() - last > 2 * 60 * 60 * 1000;
  return {
    mode: settings.shadowMode ? "shadow" : "cutover_or_off",
    method: "square_labor_api",
    configured: cfg.configured,
    missingEnv: cfg.missing,
    health: stale ? "DELAYED" : settings.squareSyncHealth,
    lastSuccessfulSync: settings.squareLastSuccessfulSyncAt,
    lastAttemptedSync: settings.squareLastAttemptedSyncAt,
    lastError: settings.squareLastError,
    checkpoint: settings.squareLastCheckpoint,
    employeesSynced: settings.squareEmployeesSynced,
    shiftsSynced: settings.squareShiftsSynced,
    openShifts: settings.squareOpenShifts,
    conflicts: settings.squareConflicts,
    historicalImportThrough: settings.historicalImportThrough,
    liveSyncStartedAt: settings.liveSyncStartedAt,
    authority: settings.shadowMode
      ? "SQUARE is punch authority — PP Time is management layer only"
      : "PP Time punch authority (post-cutover)",
    estimatedMonthlyIntegrationCost: "$0 incremental beyond existing Square account (Labor API included with Square)",
    aiApiCostPerSync: "$0 — deterministic software, no LLM",
    syncFrequencyTarget: "hourly via cron Bearer CRON_SECRET",
  };
}
