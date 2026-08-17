#!/usr/bin/env node
/**
 * Shadow Mode parity: Square Labor API (read-only) vs in-memory applySquareTimecards.
 * Never writes to Square. Requires SQUARE_ACCESS_TOKEN + SQUARE_LOCATION_ID.
 */
import { createMemoryTimeStore } from "../lib/time/store.ts";
import {
  listTeamMembers,
  searchOpenTimecards,
  searchTimecardsUpdatedSince,
  squareLaborConfig,
} from "../lib/time/square-labor.ts";
import { paidSecondsForShift } from "../lib/time/hours.ts";

const SAMPLE_NAMES = [
  ["Jacob", "Mershon"],
  ["Jorge", "Arellano"],
  ["Mason", "Mershon"],
];

const SAMPLE_NAMES = [
  ["Jacob", "Mershon"],
  ["Jorge", "Arellano"],
  ["Mason", "Mershon"],
];

function nameOf(first, last) {
  return `${first} ${last}`.trim().toLowerCase();
}

async function main() {
  const cfg = squareLaborConfig();
  const attemptedAt = new Date().toISOString();
  if (!cfg.configured) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          SQUARE_CURRENT_THROUGH: null,
          LAST_SUCCESSFUL_SYNC: null,
          error: `NOT_CONFIGURED: ${cfg.missing.join(", ")}`,
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const team = await listTeamMembers();
  const updated = await searchTimecardsUpdatedSince({ updatedAfterIso: null });
  const open = await searchOpenTimecards();
  if (!team.ok) {
    console.log(JSON.stringify({ ok: false, error: team.error, status: team.status }, null, 2));
    process.exit(1);
  }
  if (!updated.ok) {
    console.log(JSON.stringify({ ok: false, error: updated.error, status: updated.status }, null, 2));
    process.exit(1);
  }

  const byId = new Map();
  for (const t of updated.timecards) byId.set(t.id, t);
  if (open.ok) for (const t of open.timecards) byId.set(t.id, t);
  const cards = [...byId.values()];
  const { applySquareTimecards, sourceShiftId } = await import("../lib/time/shadow-sync.ts");
  const store = createMemoryTimeStore();
  const applied = await applySquareTimecards(store, cards, team.members, attemptedAt, null);
  const shifts = await store.listShifts();
  const dates = shifts.map((s) => s.startAt.slice(0, 10)).filter(Boolean).sort();
  const squareOpen = cards.filter((c) => c.status === "OPEN").length;
  const ppOpen = shifts.filter((s) => s.status === "open" || s.status === "on_lunch").length;

  const employees = await store.listEmployees();
  const sample = [];
  let punchDisc = 0;
  let lunchDisc = 0;
  let hoursDisc = 0;
  let otDisc = 0;

  for (const [first, last] of SAMPLE_NAMES) {
    const emp = employees.find((e) => nameOf(e.firstName, e.lastName) === nameOf(first, last));
    const tm = team.members.find(
      (m) => nameOf(m.given_name || "", m.family_name || "") === nameOf(first, last),
    );
    const empShifts = emp ? shifts.filter((s) => s.employeeId === emp.id) : [];
    const sqCards = tm ? cards.filter((c) => c.team_member_id === tm.id) : [];
    sample.push({
      name: `${first} ${last}`,
      ppEmployee: Boolean(emp),
      squareTeam: Boolean(tm),
      ppShifts: empShifts.length,
      squareTimecards: sqCards.length,
    });
  }

  const lunchCards = cards.filter((c) => (c.breaks || []).some((b) => b.start_at)).slice(0, 5);
  const otCards = cards.filter((c) => {
    if (!c.start_at || !c.end_at) return false;
    const br = (c.breaks || [])[0];
    const paid = paidSecondsForShift({
      startAt: c.start_at,
      endAt: c.end_at,
      lunchStartAt: br?.start_at || null,
      lunchEndAt: br?.end_at || null,
    });
    return paid / 3600 > 8;
  }).slice(0, 5);
  const overnight = cards.filter((c) => c.start_at && c.end_at && c.start_at.slice(0, 10) !== c.end_at.slice(0, 10)).slice(0, 3);

  const compared = [...lunchCards, ...otCards, ...overnight, ...cards.filter((c) => c.status === "OPEN").slice(0, 3)];
  const seen = new Set();
  for (const c of compared) {
    if (!c.id || seen.has(c.id)) continue;
    seen.add(c.id);
    const s = await store.getShift(sourceShiftId(c.id));
    const lunch = (c.breaks || []).find((b) => b.start_at);
    if (!s) {
      punchDisc += 1;
      continue;
    }
    if ((s.startAt || null) !== (c.start_at || null)) punchDisc += 1;
    if ((s.endAt || null) !== (c.end_at || null)) punchDisc += 1;
    if ((s.lunchStartAt || null) !== (lunch?.start_at || null)) lunchDisc += 1;
    if ((s.lunchEndAt || null) !== (lunch?.end_at || null)) lunchDisc += 1;
    if (c.end_at && c.start_at) {
      const paid = paidSecondsForShift({
        startAt: c.start_at,
        endAt: c.end_at,
        lunchStartAt: lunch?.start_at || null,
        lunchEndAt: lunch?.end_at || null,
      });
      const paidH = Number((paid / 3600).toFixed(4));
      const reg = Math.min(paidH, 8);
      const ot = Math.max(0, paidH - 8);
      if (s.importedRegularHours != null && Math.abs(s.importedRegularHours - reg) > 0.02) hoursDisc += 1;
      if (s.importedOvertimeHours != null && Math.abs(s.importedOvertimeHours - ot) > 0.02) otDisc += 1;
    }
  }

  const unexplained = punchDisc + lunchDisc + hoursDisc + otDisc;
  console.log(
    JSON.stringify(
      {
        ok: unexplained === 0,
        SQUARE_CURRENT_THROUGH: dates.at(-1) || null,
        PP_TIME_CURRENT_THROUGH: dates.at(-1) || null,
        LAST_SUCCESSFUL_SYNC: attemptedAt,
        ROSTER_COUNT_SQUARE: team.members.length,
        ROSTER_COUNT_PP_TIME: employees.length,
        OPEN_SHIFTS_SQUARE: squareOpen,
        OPEN_SHIFTS_PP_TIME: ppOpen,
        SHIFT_SAMPLE_COUNT: seen.size,
        PUNCH_DISCREPANCIES: punchDisc,
        LUNCH_DISCREPANCIES: lunchDisc,
        REGULAR_HOURS_DISCREPANCIES: hoursDisc,
        OT_DISCREPANCIES: otDisc,
        UNEXPLAINED_DISCREPANCIES: unexplained,
        applied,
        sample,
        earliest: dates[0] || null,
        latest: dates.at(-1) || null,
        totalSquareTimecards: cards.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
