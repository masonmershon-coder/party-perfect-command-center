import { listExceptions, openShiftFor, clockStatusFromShift } from "@/lib/time/punch";
import type { TimeStore } from "@/lib/time/store";
import { publicEmployee } from "@/lib/time/serialize";
import {
  buildSecurityAlertQueue,
  buildShellyReviewQueue,
  isOpenReviewState,
} from "@/lib/time/workflow";

/**
 * Mike is READ-ONLY. Friday: remind Shelly about unresolved payroll/timecard issues.
 * Monday: final readiness scan before Michelle processes payroll.
 * Mike never approves, denies, or modifies payroll records.
 * Security alerts are summarized for Mason/Michelle — not routed to Shelly.
 */
export async function buildMikeTimeStatus(store: TimeStore, at = new Date()) {
  const employees = (await store.listEmployees()).filter((e) => e.active);
  const working = [];
  for (const e of employees) {
    const shift = await openShiftFor(store, e.id);
    const status = clockStatusFromShift(shift);
    if (status !== "NOT_CLOCKED_IN") {
      working.push({
        employee: publicEmployee(e),
        status,
        shiftId: shift?.id ?? null,
        since: shift?.startAt ?? null,
      });
    }
  }
  const exceptions = await listExceptions(store, at);
  const queue = await buildShellyReviewQueue(store);
  const security = await buildSecurityAlertQueue(store);
  const periods = await store.listPayPeriods();
  const openPeriod = periods.find((p) => p.status !== "finalized") ?? null;

  // Punches are always allowed; verified locations improve distance signals only.
  const punchReady = true;

  const pendingCorrections = (await store.listCorrections()).filter((c) => isOpenReviewState(c.state));
  const absencesAwaiting = (await store.listAbsences()).filter((a) => isOpenReviewState(a.state));
  const timeOffAwaiting = (await store.listTimeOff()).filter((t) => isOpenReviewState(t.state));
  const unansweredClarifications = [
    ...pendingCorrections,
    ...absencesAwaiting,
    ...timeOffAwaiting,
  ].filter((r) => r.state === "needs_clarification");
  const incompleteTimecards = exceptions.filter(
    (e) => e.type === "incomplete_timecard" || e.type === "open_lunch",
  );
  const systemClosedPending = exceptions.filter((e) => e.type === "system_closed_pending_correction");
  const payrollImpacting = exceptions.filter((e) =>
    [
      "incomplete_timecard",
      "open_lunch",
      "impossible_sequence",
      "pending_correction",
      "absence_awaiting_review",
      "system_closed_pending_correction",
    ].includes(e.type),
  );

  const payrollReady =
    exceptions.length === 0 &&
    queue.open.length === 0 &&
    Boolean(openPeriod) &&
    openPeriod?.status === "review";

  return {
    asOf: at.toISOString(),
    timezone: "America/Chicago",
    punchReady,
    payrollReady,
    whoIsWorking: working,
    exceptions,
    payPeriods: periods,
    flags: {
      pendingCorrections: pendingCorrections.length,
      absencesAwaitingReview: absencesAwaiting.length,
      unansweredClarifications: unansweredClarifications.length,
      incompleteTimecards: incompleteTimecards.length,
      futureTimeOffAwaitingAction: timeOffAwaiting.length,
      systemClosedPendingCorrection: systemClosedPending.length,
      payrollImpactingExceptions: payrollImpacting.length,
      shellyQueueOpen: queue.open.length,
      securityAlertsOpen: security.open.length,
      securityAlertsHigh: security.high.length,
      securityAlertsMedium: security.medium.length,
    },
    shellyQueue: queue.open,
    securityAlerts: security.open,
    fridayCheck: {
      purpose: "Remind Shelly about unresolved payroll/timecard cleanup before weekend close",
      remindShelly: queue.open.length > 0 || payrollImpacting.length > 0,
      exceptionCount: exceptions.length,
      shellyQueueOpen: queue.open.length,
      systemClosedPendingCorrection: systemClosedPending.length,
      payrollReady,
    },
    securityCheck: {
      purpose: "Mason primary / Michelle owner — security & time-theft review signals (not Shelly)",
      remindMason: security.open.length > 0,
      securityAlertsOpen: security.open.length,
      securityAlertsHigh: security.high.length,
      note: "Review signals only — never automatic accusation of theft",
    },
    mondayCheck: {
      purpose: "Final readiness scan before Michelle processes payroll",
      workingCount: working.length,
      shellyQueueOpen: queue.open.length,
      securityAlertsOpen: security.open.length,
      securityAlertsHigh: security.high.length,
      systemClosedPendingCorrection: systemClosedPending.length,
      payrollReady,
      blockers: payrollImpacting.map((e) => e.type),
    },
    writes: false,
    mayApproveOrModify: false,
  };
}
