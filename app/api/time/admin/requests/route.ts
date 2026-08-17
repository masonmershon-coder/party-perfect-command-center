import { privateJson } from "@/lib/api-auth";
import { getTimeStore } from "@/lib/time/deps";
import { isTimeAdminError, requireTimeAdmin } from "@/lib/time/http";
import type { ApprovalState, RequestKind } from "@/lib/time/types";
import {
  applyLeaveHoursIfEligible,
  buildShellyReviewQueue,
  formatAbsenceNotice,
  formatCorrectionNotice,
  formatTimeOffNotice,
  notifyEmployee,
  parseAdminClass,
  postRequestMessage,
} from "@/lib/time/workflow";

type QueueKind = RequestKind;

/**
 * Shelly's operational cleanup queue.
 * Fix My Time, absences, time-off, clarifications — no raw security telemetry.
 * Security alerts live at /api/time/admin/security (Mason / Michelle).
 */
export async function GET(request: Request) {
  const gate = await requireTimeAdmin(request, "review");
  if (isTimeAdminError(gate)) return gate;
  const store = await getTimeStore();
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") as QueueKind | null;
  const id = url.searchParams.get("id");
  if (kind && id) {
    if (kind === ("punch_verification" as string)) {
      return privateJson(
        {
          error: "Security alerts moved",
          use: "/api/time/admin/security?id=…",
          note: "Punch security evidence is Mason/Michelle only — not Shelly ops.",
        },
        { status: 410 },
      );
    }
    const messages = await store.listMessages(kind, id);
    if (kind === "correction") {
      return privateJson({ item: await store.getCorrection(id), messages });
    }
    if (kind === "absence") {
      return privateJson({ item: await store.getAbsence(id), messages });
    }
    return privateJson({ item: await store.getTimeOff(id), messages });
  }
  const queue = await buildShellyReviewQueue(store);
  return privateJson({
    label: "Shelly's Cleanup Queue",
    role: "timekeeping cleanup manager",
    goal: "Get everyone's time clean before it reaches Michelle.",
    flow: "EMPLOYEE → SHELLY CLEANUP → MICHELLE FINAL PAYROLL → PAYCHEX",
    excludes: [
      "raw IP addresses",
      "device-risk scores",
      "unusual IP history",
      "trusted-device security history",
      "suspected time-theft flags",
      "impossible-travel flags",
      "fraud/security scoring",
    ],
    securityAlerts: "/api/time/admin/security",
    ...queue,
    corrections: await store.listCorrections(),
    absences: await store.listAbsences(),
    timeOff: await store.listTimeOff(),
  });
}

export async function PATCH(request: Request) {
  const gate = await requireTimeAdmin(request, "review");
  if (isTimeAdminError(gate)) return gate;
  let body: {
    kind?: QueueKind | "punch_verification";
    id?: string;
    state?: ApprovalState;
    adminRemark?: string;
    managerRemark?: string;
    approvedCorrection?: string;
    adminClass?: string;
    leaveHoursApplied?: number;
    clarification?: string;
    message?: string;
    acknowledge?: boolean;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return privateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  const kind = body.kind;
  if (!kind || !body.id) {
    return privateJson({ error: "kind and id required" }, { status: 400 });
  }
  const store = await getTimeStore();
  const now = new Date().toISOString();
  const actor = gate.actor;

  if (kind === "punch_verification") {
    return privateJson(
      {
        error: "Use /api/time/admin/security to acknowledge security alerts",
        note: "Shelly does not acknowledge security/time-theft signals.",
      },
      { status: 410 },
    );
  }

  if (body.clarification || body.message) {
    const text = String(body.clarification || body.message || "").trim();
    if (text) {
      await postRequestMessage(store, {
        requestKind: kind,
        requestId: body.id,
        authorRole: "shelly",
        authorId: actor,
        body: text,
      });
    }
  }

  if (kind === "absence") {
    const existing = await store.getAbsence(body.id);
    if (!existing) return privateJson({ error: "Not found" }, { status: 404 });
    let next = {
      ...existing,
      employeeNote: existing.employeeNote,
      managerRemark:
        body.managerRemark != null ? String(body.managerRemark).slice(0, 4000) : existing.managerRemark,
      adminClass: body.adminClass != null ? parseAdminClass(body.adminClass) : existing.adminClass,
      state: body.state ?? (body.clarification ? ("needs_clarification" as const) : existing.state),
      decidedBy: body.state === "approved" || body.state === "denied" ? actor : existing.decidedBy,
      decidedAt: body.state === "approved" || body.state === "denied" ? now : existing.decidedAt,
      updatedAt: now,
    };
    if (body.state === "approved" && body.leaveHoursApplied != null) {
      next = await applyLeaveHoursIfEligible(store, next, Number(body.leaveHoursApplied), actor);
      next = { ...next, updatedAt: now };
    }
    const saved = await store.upsertAbsence(next);
    await store.appendAudit({
      at: now,
      actor,
      action: `absence.${saved.state}`,
      target: saved.id,
      detail: `${saved.adminClass}|${saved.managerRemark}`,
    });
    if (saved.state !== "pending") {
      const notice = formatAbsenceNotice(saved);
      await notifyEmployee(store, {
        employeeId: saved.employeeId,
        title: notice.title,
        body: notice.body,
        requestKind: "absence",
        requestId: saved.id,
      });
    }
    return privateJson({ absence: saved });
  }

  if (kind === "time_off") {
    const existing = await store.getTimeOff(body.id);
    if (!existing) return privateJson({ error: "Not found" }, { status: 404 });
    const saved = await store.upsertTimeOff({
      ...existing,
      employeeNote: existing.employeeNote,
      managerRemark:
        body.managerRemark != null ? String(body.managerRemark).slice(0, 4000) : existing.managerRemark,
      state: body.state ?? (body.clarification ? "needs_clarification" : existing.state),
      decidedBy: body.state === "approved" || body.state === "denied" ? actor : existing.decidedBy,
      decidedAt: body.state === "approved" || body.state === "denied" ? now : existing.decidedAt,
      updatedAt: now,
    });
    await store.appendAudit({
      at: now,
      actor,
      action: `time_off.${saved.state}`,
      target: saved.id,
      detail: saved.managerRemark,
    });
    if (saved.state !== "pending") {
      const notice = formatTimeOffNotice(saved);
      await notifyEmployee(store, {
        employeeId: saved.employeeId,
        title: notice.title,
        body: notice.body,
        requestKind: "time_off",
        requestId: saved.id,
      });
    }
    return privateJson({ timeOff: saved });
  }

  const existing = await store.getCorrection(body.id);
  if (!existing) return privateJson({ error: "Not found" }, { status: 404 });
  const saved = await store.upsertCorrection({
    ...existing,
    employeeExplanation: existing.employeeExplanation,
    requestedCorrection: existing.requestedCorrection,
    originalSnapshot: existing.originalSnapshot,
    adminRemark: body.adminRemark != null ? String(body.adminRemark).slice(0, 4000) : existing.adminRemark,
    approvedCorrection:
      body.approvedCorrection != null
        ? String(body.approvedCorrection).slice(0, 2000)
        : existing.approvedCorrection,
    state: body.state ?? (body.clarification ? "needs_clarification" : existing.state),
    decidedBy: body.state === "approved" || body.state === "denied" ? actor : existing.decidedBy,
    decidedAt: body.state === "approved" || body.state === "denied" ? now : existing.decidedAt,
    updatedAt: now,
  });
  await store.appendAudit({
    at: now,
    actor,
    action: `correction.${saved.state}`,
    target: saved.id,
    detail: `${saved.adminRemark}|${saved.approvedCorrection}`,
  });

  // Shelly/Michelle approval of forgotten clock-out → ADMIN_APPROVED hours (never silent system time).
  if (saved.state === "approved" && saved.issueType === "forgot_clock_out" && saved.shiftId) {
    const shift = await store.getShift(saved.shiftId);
    if (shift) {
      let endAt = shift.endAt;
      const isoMatch = (saved.approvedCorrection || saved.requestedCorrection).match(
        /\d{4}-\d{2}-\d{2}T[\d:.]+Z?/,
      );
      if (isoMatch) {
        const parsed = Date.parse(isoMatch[0]);
        if (Number.isFinite(parsed)) endAt = new Date(parsed).toISOString();
      }
      await store.upsertShift({
        ...shift,
        endAt,
        status: "closed",
        closeKind: "admin",
        hoursAuthority: "ADMIN_APPROVED",
        paidSeconds: null,
      });
      await store.appendAudit({
        at: now,
        actor,
        action: "shift.admin_approved_clock_out",
        target: shift.id,
        detail: `correction=${saved.id};endAt=${endAt}`,
      });
    }
  }

  if (saved.state !== "pending") {
    const notice = formatCorrectionNotice(saved);
    await notifyEmployee(store, {
      employeeId: saved.employeeId,
      title: notice.title,
      body: notice.body,
      requestKind: "correction",
      requestId: saved.id,
    });
  }
  return privateJson({ correction: saved });
}
