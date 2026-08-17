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

export function sourceShiftId(timecardId: string): string {
  // Stable UUID-ish id derived from Square timecard id (dedupe across syncs).
  const hex = createHash("sha256").update(`square-tc:${timecardId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function unpaidBreak(tc: SquareTimecard): { start: string | null; end: string | null } {
  const b = (tc.breaks || []).find((x) => x.start_at) || (tc.breaks || [])[0];
  return { start: b?.start_at || null, end: b?.end_at || null };
}

function nameKey(first: string, last: string): string {
  return `${first} ${last}`.trim().toLowerCase();
}

const PP_PROTECTED_CAPS = new Set(["timekeeping.owner", "timekeeping.security", "timekeeping.admin"]);

export type ApplyTimecardsResult = {
  imported: number;
  updated: number;
  skippedConflict: number;
  openShifts: number;
  employeesSeen: number;
  latestUpdated: string | null;
  rosterUpserted: number;
};

/**
 * Apply Square timecards + team members into the Time store (Square → PP only).
 * Idempotent: stable shift ids; punch insertPunch dedupes on idempotencyKey.
 * Open Square cards stay OPEN (no invented clock-out).
 */
export async function applySquareTimecards(
  store: TimeStore,
  timecards: SquareTimecard[],
  teamMembers: { id: string; given_name?: string; family_name?: string; status?: string }[],
  attemptedAt: string,
  priorCheckpoint: string | null,
): Promise<ApplyTimecardsResult> {
  const { hashTimePin } = await import("@/lib/time/pin");
  const placeholderPin = hashTimePin("0000");
  let rosterUpserted = 0;
  const employees = await store.listEmployees();
  const byName = new Map(employees.map((e) => [nameKey(e.firstName, e.lastName), e]));

  for (const m of teamMembers) {
    const first = (m.given_name || "").trim();
    const last = (m.family_name || "").trim();
    if (!first || !last) continue;
    const key = nameKey(first, last);
    const existing = byName.get(key);
    if (existing) {
      const protectedCaps = existing.capabilities.some((c) => PP_PROTECTED_CAPS.has(c));
      if (!protectedCaps) {
        const next = await store.upsertEmployee({
          ...existing,
          active: (m.status || "ACTIVE").toUpperCase() !== "INACTIVE",
          notes: existing.notes.includes("square-tm:")
            ? existing.notes
            : `${existing.notes} square-tm:${m.id}`.trim(),
          updatedAt: attemptedAt,
        });
        byName.set(key, next);
      }
      continue;
    }
    const created = await store.upsertEmployee({
      id: `sq-${m.id}`.slice(0, 36),
      employeeNumber: "",
      preferredName: first,
      firstName: first,
      lastName: last,
      phoneLast4: null,
      active: (m.status || "ACTIVE").toUpperCase() !== "INACTIVE",
      department: "",
      title: "",
      pinHash: placeholderPin,
      capabilities: ["punch", "self_history", "self_request"],
      ptoEligible: false,
      vacationEligible: false,
      onboardingStatus: "login_configured",
      startDate: null,
      notes: `square-tm:${m.id} — PIN via /time/pins (placeholder hash only)`,
      credentialsVersion: 0,
      createdAt: attemptedAt,
      updatedAt: attemptedAt,
    });
    byName.set(key, created);
    rosterUpserted += 1;
  }

  const nameByTm = new Map(
    teamMembers.map((m) => [
      m.id,
      { first: (m.given_name || "").trim(), last: (m.family_name || "").trim() },
    ]),
  );

  let imported = 0;
  let updatedCount = 0;
  let skippedConflict = 0;
  let openShifts = 0;
  let latestUpdated: string | null = priorCheckpoint;

  for (const tc of timecards) {
    if (tc.status === "OPEN") openShifts += 1;
    if (tc.updated_at && (!latestUpdated || tc.updated_at > latestUpdated)) {
      latestUpdated = tc.updated_at;
    }
    if (!tc.start_at) continue;

    const names = tc.team_member_id ? nameByTm.get(tc.team_member_id) : null;
    const identity = names ? nameKey(names.first, names.last) : "";
    let employee = identity ? byName.get(identity) : undefined;
    if (!employee && names?.first && names?.last) {
      const created = await store.upsertEmployee({
        id: `sq-shift-${tc.team_member_id || tc.id}`.slice(0, 36),
        employeeNumber: "",
        preferredName: names.first,
        firstName: names.first,
        lastName: names.last,
        phoneLast4: null,
        active: false,
        department: "",
        title: "",
        pinHash: placeholderPin,
        capabilities: ["punch", "self_history", "self_request"],
        ptoEligible: false,
        vacationEligible: false,
        onboardingStatus: "login_configured",
        startDate: null,
        notes: `SHIFT_HISTORY_ONLY square-tm:${tc.team_member_id || ""} — PIN via /time/pins`,
        credentialsVersion: 0,
        createdAt: attemptedAt,
        updatedAt: attemptedAt,
      });
      byName.set(identity, created);
      employee = created;
      rosterUpserted += 1;
    }
    if (!employee) continue;

    const shiftId = sourceShiftId(tc.id);
    const existing = await store.getShift(shiftId);
    const lunch = unpaidBreak(tc);
    const clockOut = tc.end_at || null;
    const squareChanged =
      Boolean(existing) &&
      ((existing!.endAt || null) !== clockOut ||
        (existing!.lunchStartAt || null) !== (lunch.start || null) ||
        (existing!.lunchEndAt || null) !== (lunch.end || null) ||
        existing!.startAt !== tc.start_at);

    if (
      existing &&
      (existing.employeeCorrectionId ||
        existing.status === "pending_correction" ||
        existing.closeKind === "system_pending_correction")
    ) {
      if (squareChanged) {
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

    const status =
      tc.status === "OPEN"
        ? lunch.start && !lunch.end
          ? "on_lunch"
          : "open"
        : "closed";

    const paid = clockOut
      ? paidSecondsForShift({
          startAt: tc.start_at,
          endAt: clockOut,
          lunchStartAt: lunch.start,
          lunchEndAt: lunch.end,
        })
      : null;
    const paidHours = paid == null ? null : Number((paid / 3600).toFixed(4));
    const regularHours = paidHours == null ? null : Math.min(paidHours, 8);
    const otHours = paidHours == null ? null : Math.max(0, paidHours - 8);

    const shift = {
      id: shiftId,
      employeeId: employee.id,
      startAt: tc.start_at,
      endAt: clockOut,
      lunchStartAt: lunch.start,
      lunchEndAt: lunch.end,
      status: status as "open" | "on_lunch" | "closed",
      paidSeconds: paid,
      lunchSeconds: lunchSeconds({ lunchStartAt: lunch.start, lunchEndAt: lunch.end }),
      source: "import" as const,
      payPeriodId: null,
      importedRegularHours: regularHours,
      importedOvertimeHours: otHours,
      importedDoubletimeHours: 0,
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

  return {
    imported,
    updated: updatedCount,
    skippedConflict,
    openShifts,
    employeesSeen: teamMembers.length,
    latestUpdated,
    rosterUpserted,
  };
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
  const members = team.ok ? team.members : [];

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
      employeesSeen: members.length,
      checkpoint: settings.squareLastCheckpoint,
      health,
    };
  }

  const byId = new Map<string, SquareTimecard>();
  for (const t of updated.timecards) byId.set(t.id, t);
  if (open.ok) for (const t of open.timecards) byId.set(t.id, t);

  const applied = await applySquareTimecards(
    store,
    [...byId.values()],
    members,
    attemptedAt,
    settings.squareLastCheckpoint,
  );

  const latestImported = [...byId.values()]
    .map((t) => t.start_at?.slice(0, 10))
    .filter(Boolean)
    .sort()
    .at(-1) || settings.historicalImportThrough;

  await store.upsertSettings({
    squareSyncHealth: "HEALTHY",
    squareLastSuccessfulSyncAt: attemptedAt,
    squareLastAttemptedSyncAt: attemptedAt,
    squareLastError: null,
    squareLastCheckpoint: applied.latestUpdated,
    squareEmployeesSynced: applied.employeesSeen,
    squareShiftsSynced: byId.size,
    squareOpenShifts: applied.openShifts,
    squareConflicts: (settings.squareConflicts || 0) + applied.skippedConflict,
    shadowMode: true,
    liveSyncStartedAt: settings.liveSyncStartedAt || attemptedAt,
    historicalImportThrough: latestImported,
  });

  await store.appendAudit({
    at: attemptedAt,
    actor: "square-sync",
    action: "square.shadow_sync",
    target: applied.latestUpdated || "none",
    detail: `imported=${applied.imported} updated=${applied.updated} open=${applied.openShifts} conflicts=${applied.skippedConflict} roster=${applied.rosterUpserted}`,
  });

  return {
    ok: true,
    method: "square_labor_api",
    attemptedAt,
    configured: true,
    missingEnv: [],
    error: null,
    statusCode: null,
    imported: applied.imported,
    updated: applied.updated,
    openShifts: applied.openShifts,
    skippedConflict: applied.skippedConflict,
    employeesSeen: applied.employeesSeen,
    checkpoint: applied.latestUpdated,
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
