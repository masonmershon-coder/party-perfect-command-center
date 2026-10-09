// money.week rendering in the agent POR context. HERMETIC — synthetic snapshot, no I/O.
//
//   npx tsx scripts/test-por-week.ts
import assert from "node:assert/strict";
import { formatPorContextForAgents } from "../lib/por-snapshot";
import type { PorSnapshot, PorSyncMeta } from "../lib/types";

type Week = NonNullable<PorSnapshot["money"]["week"]>;

const week: Week = {
  startDate: "2026-09-28",
  endDate: "2026-10-04",
  basis: "DeliveryDate",
  booked: { count: 3, rent: 1000, sale: 200, tax: 50.5, total: 1250.5, paid: 625.25 },
  quotePipeline: { count: 2, total: 800 },
  collected: 900.75,
  byDay: [{ date: "2026-10-03", count: 3, total: 1250.5 }],
  byStatus: [{ status: "Reservation", count: 3, total: 1250.5 }],
};

const failedWeek: Week = {
  startDate: null,
  endDate: null,
  basis: "DeliveryDate",
  booked: { count: 0, rent: 0, sale: 0, tax: 0, total: 0, paid: 0 },
  quotePipeline: { count: 0, total: 0 },
  collected: 0,
  byDay: [],
  byStatus: [],
};

const snapshot = (w: Week | undefined): PorSnapshot => ({
  version: 1,
  agentBuild: w ? "2026-09-09-week-revenue" : undefined,
  syncedAt: new Date().toISOString(),
  sourceHost: "SYNTHETIC",
  sourceDatabase: "SYNTHETIC",
  inventory: { totalItems: 1, totalQuantity: 1, availableQuantity: 1, outQuantity: 0, categories: [] },
  money: {
    arOpenBalance: 0,
    arCustomerCount: 0,
    aging: { current: 0, days30: 0, days60: 0, days90: 0, days120Plus: 0 },
    paymentsLast24h: { count: 0, volume: 0 },
    revenue: { last7Days: 1, monthToDate: 2, last30Days: 3, yearToDate: 4 },
    ...(w ? { week: w } : {}),
  },
  ops: { openContracts: 0, deliveriesToday: 0, returnsDueToday: 0 },
});

const meta: PorSyncMeta = {
  present: true,
  stale: false,
  veryStale: false,
  freshness: "fresh",
  syncedAt: new Date().toISOString(),
  ageMs: 60_000,
  ageLabel: "synced 1 min ago",
  sourceHost: "SYNTHETIC",
};

const owner = (w: Week | undefined) => formatPorContextForAgents(snapshot(w), meta, { includeFinancials: true });

let pass = 0;
const t = (name: string, fn: () => void) => {
  fn();
  console.log(`  PASS  ${name}`);
  pass++;
};

console.log("POR money.week rendering (synthetic only)\n");

t("owner view renders booked, collected and quote pipeline separately", () => {
  const out = owner(week);
  assert.match(out, /This week 2026-09-28 to 2026-10-04 \(by DeliveryDate\): booked \$1250\.50 across 3 orders/);
  assert.match(out, /Cash collected this week \$900\.75/);
  assert.match(out, /Open quotes for the week \$800\.00 \(2\) — NOT booked revenue/);
  assert.match(out, /This week by day: 2026-10-03 3 orders \$1250\.50/);
  assert.match(out, /This week by status: Reservation 3 \$1250\.50/);
});

t("financials locked by default: no week figures in non-owner context", () => {
  const out = formatPorContextForAgents(snapshot(week), meta);
  assert.doesNotMatch(out, /This week/);
  assert.doesNotMatch(out, /1250\.50|900\.75|625\.25/);
});

t("failed rollup (null dates, zero totals) is UNAVAILABLE, never a $0 week", () => {
  const out = owner(failedWeek);
  assert.match(out, /This-week booked totals: UNAVAILABLE — the ENTERPRISE week rollup failed/);
  assert.doesNotMatch(out, /This week null/);
  assert.doesNotMatch(out, /booked \$0\.00/);
});

t("one missing date is treated as a failed rollup", () => {
  const out = owner({ ...week, endDate: null });
  assert.match(out, /UNAVAILABLE/);
  assert.doesNotMatch(out, /This week 2026-09-28/);
});

t("older agent without money.week keeps the do-not-invent line", () => {
  const out = owner(undefined);
  assert.match(out, /not in this snapshot — ENTERPRISE is running an agent older than agentBuild 2026-09-09-week-revenue/);
  assert.doesNotMatch(out, /UNAVAILABLE/);
});

t("empty byDay / byStatus lines are omitted", () => {
  const out = owner({ ...week, byDay: [], byStatus: [] });
  assert.match(out, /This week 2026-09-28/);
  assert.doesNotMatch(out, /This week by day|This week by status/);
});

console.log(`\n${pass} passed, 0 failed`);
