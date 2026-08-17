import {
  isDurableBlobConfigured,
  isDurableRedisConfigured,
  readDurableJson,
  writeDurableJson,
} from "@/lib/durable-json";
import {
  createMemoryTimeStore,
  seedDemoEmployees,
  seedShowroomLocation,
  type TimeStore,
} from "@/lib/time/store";
import { isTimePreview, PREVIEW_SHOWROOM_COORDS } from "@/lib/time/preview";
import { blankPunchEvidence, DEFAULT_TIME_SETTINGS } from "@/lib/time/types";
import type {
  LeaveBank,
  LeaveTransaction,
  PayPeriod,
  PunchEvent,
  RequestMessage,
  SquareImportRun,
  TimeAbsence,
  TimeAudit,
  TimeCorrection,
  TimeEmployee,
  TimeNotification,
  TimeOffRequest,
  TimeSchedule,
  TimeShift,
  TrustedDevice,
  WorkLocation,
  TimeSettings,
} from "@/lib/time/types";
import { normalizeShift } from "@/lib/time/store";

const SNAPSHOT_KEY = "time/pp-time-v1.json";

type TimeSnapshot = {
  v: 1 | 2;
  employees: TimeEmployee[];
  locations: WorkLocation[];
  punches: PunchEvent[];
  shifts: TimeShift[];
  trustedDevices?: TrustedDevice[];
  settings?: TimeSettings;
  corrections: TimeCorrection[];
  absences: TimeAbsence[];
  timeOff: TimeOffRequest[];
  messages: RequestMessage[];
  notifications: TimeNotification[];
  banks: LeaveBank[];
  leaveTx: LeaveTransaction[];
  schedules: TimeSchedule[];
  periods: PayPeriod[];
  audit: TimeAudit[];
  imports: SquareImportRun[];
};

function emptySnapshot(): TimeSnapshot {
  return {
    v: 2,
    employees: [],
    locations: [],
    punches: [],
    shifts: [],
    trustedDevices: [],
    settings: { ...DEFAULT_TIME_SETTINGS },
    corrections: [],
    absences: [],
    timeOff: [],
    messages: [],
    notifications: [],
    banks: [],
    leaveTx: [],
    schedules: [],
    periods: [],
    audit: [],
    imports: [],
  };
}

function normalizePunch(p: PunchEvent): PunchEvent {
  return blankPunchEvidence({
    ...p,
    id: p.id,
    employeeId: p.employeeId,
    type: p.type,
    occurredAt: p.occurredAt,
    idempotencyKey: p.idempotencyKey,
    source: p.source,
  });
}

async function dump(store: TimeStore): Promise<TimeSnapshot> {
  return {
    v: 2,
    employees: await store.listEmployees(),
    locations: await store.listLocations(),
    punches: await store.listPunches(),
    shifts: await store.listShifts(),
    trustedDevices: await store.listTrustedDevices(),
    settings: await store.getSettings(),
    corrections: await store.listCorrections(),
    absences: await store.listAbsences(),
    timeOff: await store.listTimeOff(),
    messages: [],
    notifications: [],
    banks: await store.listLeaveBanks(),
    leaveTx: await store.listLeaveTransactions(),
    schedules: await store.listSchedules(),
    periods: await store.listPayPeriods(),
    audit: await store.listAudit(),
    imports: await store.listImportRuns(),
  };
}

/** Rebuild a memory store and hydrate from snapshot (messages/notifications loaded via side bags). */
async function hydrate(snap: TimeSnapshot): Promise<{
  store: TimeStore;
  messages: RequestMessage[];
  notifications: TimeNotification[];
}> {
  const store = createMemoryTimeStore();
  // Clear seed employees by overwriting with snapshot when present
  if (snap.employees.length) {
    for (const e of snap.employees) await store.upsertEmployee(e);
  }
  if (snap.locations.length) {
    for (const l of snap.locations) await store.upsertLocation(l);
  } else if (isTimePreview()) {
    await store.upsertLocation({
      ...seedShowroomLocation(),
      latitude: PREVIEW_SHOWROOM_COORDS.latitude,
      longitude: PREVIEW_SHOWROOM_COORDS.longitude,
      radiusM: PREVIEW_SHOWROOM_COORDS.radiusM,
      active: true,
      verified: true,
      notes: "PREVIEW ONLY — approximate coords for phone testing. Not Mason-verified production.",
    });
  }
  for (const p of snap.punches) await store.insertPunch(normalizePunch(p));
  for (const s of snap.shifts) await store.upsertShift(normalizeShift(s));
  for (const d of snap.trustedDevices || []) await store.upsertTrustedDevice(d);
  if (snap.settings) await store.upsertSettings(snap.settings);
  for (const c of snap.corrections) await store.upsertCorrection(c);
  for (const a of snap.absences) await store.upsertAbsence(a);
  for (const t of snap.timeOff) await store.upsertTimeOff(t);
  for (const b of snap.banks) await store.upsertLeaveBank(b);
  for (const tx of snap.leaveTx) await store.insertLeaveTransaction(tx);
  for (const p of snap.periods) await store.upsertPayPeriod(p);
  for (const a of snap.audit) await store.appendAudit(a);
  for (const r of snap.imports) await store.insertImportRun(r);
  return {
    store,
    messages: snap.messages || [],
    notifications: snap.notifications || [],
  };
}

export function shouldUseDurableTimeStore(): boolean {
  const durableStoreConfigured =
    isDurableRedisConfigured() || isDurableBlobConfigured();
  return (
    durableStoreConfigured &&
    (isTimePreview() || process.env.TIME_USE_REDIS === "1")
  );
}

export async function createDurableTimeStore(): Promise<TimeStore> {
  const loaded = await readDurableJson<TimeSnapshot>(SNAPSHOT_KEY, emptySnapshot());
  let snap = loaded?.v === 1 || loaded?.v === 2 ? loaded : emptySnapshot();

  // First boot on preview: seed demo roster + preview location
  if (!snap.employees.length) {
    const now = new Date().toISOString();
    snap = {
      ...emptySnapshot(),
      employees: seedDemoEmployees(now),
      locations: [
        isTimePreview()
          ? {
              ...seedShowroomLocation(),
              latitude: PREVIEW_SHOWROOM_COORDS.latitude,
              longitude: PREVIEW_SHOWROOM_COORDS.longitude,
              radiusM: PREVIEW_SHOWROOM_COORDS.radiusM,
              active: true,
              verified: true,
              notes: "PREVIEW ONLY — approximate coords for phone testing. Not Mason-verified production.",
            }
          : seedShowroomLocation(),
      ],
      banks: [
        {
          id: "bank-shelly-pto",
          employeeId: "emp-shelly",
          type: "pto",
          grantedHours: 40,
          usedHours: 8,
        },
        {
          id: "bank-shelly-vac",
          employeeId: "emp-shelly",
          type: "vacation",
          grantedHours: 80,
          usedHours: 0,
        },
      ],
    };
    await writeDurableJson(SNAPSHOT_KEY, snap);
  } else if (isTimePreview()) {
    // Ensure preview location is punchable
    const loc = snap.locations.find((l) => l.id === "loc-showroom");
    if (loc && (!loc.active || !loc.verified || loc.latitude == null)) {
      snap.locations = snap.locations.map((l) =>
        l.id === "loc-showroom"
          ? {
              ...l,
              latitude: PREVIEW_SHOWROOM_COORDS.latitude,
              longitude: PREVIEW_SHOWROOM_COORDS.longitude,
              radiusM: PREVIEW_SHOWROOM_COORDS.radiusM,
              active: true,
              verified: true,
              notes: "PREVIEW ONLY — approximate coords for phone testing. Not Mason-verified production.",
            }
          : l,
      );
      await writeDurableJson(SNAPSHOT_KEY, snap);
    }
  }

  const { store, messages, notifications } = await hydrate(snap);
  // Restore messages/notifications into store
  for (const m of messages) await store.appendMessage(m);
  for (const n of notifications) await store.insertNotification(n);

  const persist = async () => {
    const next = await dump(store);
    // dump doesn't include messages/notifications fully — pull via list APIs
    const allCorrections = await store.listCorrections();
    const allAbsences = await store.listAbsences();
    const allTimeOff = await store.listTimeOff();
    const msgBag: RequestMessage[] = [];
    for (const c of allCorrections) msgBag.push(...(await store.listMessages("correction", c.id)));
    for (const a of allAbsences) msgBag.push(...(await store.listMessages("absence", a.id)));
    for (const t of allTimeOff) msgBag.push(...(await store.listMessages("time_off", t.id)));
    // notifications: gather per employee
    const noteBag: TimeNotification[] = [];
    for (const e of await store.listEmployees()) {
      noteBag.push(...(await store.listNotifications(e.id)));
    }
    next.messages = msgBag;
    next.notifications = noteBag;
    await writeDurableJson(SNAPSHOT_KEY, next);
  };

  return new Proxy(store, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      const mutators = new Set([
        "upsertEmployee",
        "upsertLocation",
        "insertPunch",
        "updatePunch",
        "upsertShift",
        "upsertTrustedDevice",
        "upsertSettings",
        "upsertCorrection",
        "upsertAbsence",
        "upsertTimeOff",
        "appendMessage",
        "insertNotification",
        "markNotificationRead",
        "upsertLeaveBank",
        "insertLeaveTransaction",
        "upsertPayPeriod",
        "appendAudit",
        "insertImportRun",
      ]);
      if (!mutators.has(String(prop))) {
        return value.bind(target);
      }
      return async (...args: unknown[]) => {
        const result = await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
        await persist();
        return result;
      };
    },
  }) as TimeStore;
}
