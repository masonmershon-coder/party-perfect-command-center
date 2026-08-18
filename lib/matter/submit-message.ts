import { createHash, randomUUID } from "node:crypto";
import { deriveWorkItems, inferProject, initialPlan } from "@/lib/kituwa/plan";
import { routeWithMatter } from "@/lib/kituwa/matter-bridge";
import { mutateKituwaState } from "@/lib/kituwa/store";
import { mutateMatterRecords } from "@/lib/matter/records-store";
import { loadMatterOrchestrationSnapshot } from "@/lib/matter-orchestration";
import type {
  MessageSubmitRequest,
  MessageSubmitResponse,
  RejectedWorker,
  TaskEvent,
  TaskRecord,
} from "@/lib/matter/kituwa-contract-types";
import type { KituwaTask } from "@/lib/kituwa/types";

function nowIso() {
  return new Date().toISOString();
}

function digest(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

function uuidOrNew(value: string | null | undefined) {
  const v = (value || "").trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) {
    return v;
  }
  return randomUUID();
}

function event(kind: TaskEvent["kind"], detail: string, data?: Record<string, unknown>): TaskEvent {
  return { id: randomUUID(), kind, at: nowIso(), actor: "matter", detail, data };
}

function rejectedFromRouting(
  considered: Array<{ worker_id: string; eligible: boolean; reasons: string[] }>,
): RejectedWorker[] {
  const snap = loadMatterOrchestrationSnapshot();
  const workers = snap.ok ? snap.workers : [];
  return considered
    .filter((c) => !c.eligible)
    .map((c) => {
      const w = workers.find((row) => row.worker_id === c.worker_id);
      return {
        worker_id: c.worker_id,
        provider: w?.provider ?? null,
        reasons: c.reasons,
        heartbeat_at: w?.last_heartbeat ?? null,
        trust_state: w?.heartbeat_fresh ? "fresh" : "stale_or_unknown",
      };
    });
}

function aggregateAck(tasks: TaskRecord[]): MessageSubmitResponse["status"] {
  if (tasks.some((t) => t.status === "WAITING_APPROVAL")) return "awaiting_approval";
  if (tasks.some((t) => t.status === "BLOCKED" || t.status === "DEAD_LETTER")) return "blocked";
  return "accepted";
}

export async function submitMatterMessage(
  input: MessageSubmitRequest,
): Promise<{ ack: MessageSubmitResponse; task: TaskRecord }> {
  const clientId = String(input.client_message_id || "").trim();
  const text = String(input.text || "").trim();
  if (!clientId) throw new Error("client_message_id is required");
  if (!text) throw new Error("text is required");

  const { loadMatterRecords } = await import("@/lib/matter/records-store");
  const existing = await loadMatterRecords();
  const hit = existing.clientMessageIndex[clientId];
  if (hit) {
    const msg = existing.messages[hit.message_id];
    const task = existing.tasks[hit.task_id];
    if (msg && task) {
      return {
        ack: {
          message_id: msg.message_id,
          task_id: task.task_id,
          conversation_id: msg.conversation_id,
          status: aggregateAck([task, ...task.subtask_ids.map((id) => existing.tasks[id]).filter(Boolean)]),
          acknowledged_at: msg.acknowledged_at,
          project_id: task.project_id,
          business_agent_id: task.business_agent_id,
          duplicate: true,
        },
        task,
      };
    }
  }

  const createdAt = nowIso();
  const conversationId = uuidOrNew(input.conversation_id);
  const messageId = randomUUID();
  const parentTaskId = randomUUID();
  const project = inferProject(text);
  const work = deriveWorkItems(text);
  const plan = initialPlan(text, project);
  const kituwaTasks: KituwaTask[] = [];
  const subRecords: TaskRecord[] = [];

  for (const item of work) {
    const id = randomUUID();
    const needsVerification = item.category === "verification";
    const routing = await routeWithMatter({
      task_id: id,
      objective: item.title,
      task_category: item.category,
      required_capabilities: item.capabilities,
      protected_actions: item.protected,
      needs_verification: needsVerification,
      requires_intelligence: true,
      risk_class: needsVerification ? "security" : undefined,
    });

    let state: KituwaTask["state"] = "READY";
    let blocker: string | null = null;
    if (routing.owner_approval_required) {
      state = "WAITING_APPROVAL";
      blocker = "Protected action — waiting for Mason.";
    } else if (routing.blocked || !routing.primary) {
      state = "BLOCKED";
      blocker =
        routing.selection_basis ||
        "No eligible worker (capability, permission, probe, or fresh heartbeat).";
    } else {
      state = "ASSIGNED";
    }

    const rejected = rejectedFromRouting(routing.considered);
    const events: TaskEvent[] = [
      event("task.created", item.title, { category: item.category }),
      event("routing.decided", routing.selection_basis || "route()", {
        primary: routing.primary,
        verifier: routing.verifier,
        blocked: routing.blocked,
      }),
    ];
    for (const r of rejected) {
      events.push(event("worker.rejected", `${r.worker_id}: ${r.reasons.join("; ")}`, { ...r }));
    }
    if (state === "BLOCKED") events.push(event("task.blocked", blocker || "blocked"));
    if (state === "WAITING_APPROVAL") events.push(event("approval.required", blocker || "approval"));
    if (state === "ASSIGNED") events.push(event("task.assigned", routing.primary || ""));

    kituwaTasks.push({
      id,
      requestId: parentTaskId,
      title: item.title,
      category: item.category,
      state,
      requiredCapabilities: item.capabilities,
      protectedActions: item.protected,
      assignmentHat: item.hat,
      assignmentWorkerId: routing.primary,
      routing,
      blocker,
      createdAt,
      updatedAt: createdAt,
    });

    subRecords.push({
      task_id: id,
      message_id: messageId,
      conversation_id: conversationId,
      project_id: project.id,
      business_agent_id: "matter",
      domain: item.category,
      status: state,
      priority: "normal",
      owner: "mason",
      title: item.title,
      text,
      assigned_worker_id: routing.primary,
      assigned_provider: routing.primary,
      assigned_model: null,
      assigned_version: null,
      verifier_id: routing.verifier,
      capabilities_required: item.capabilities,
      capabilities_used: {},
      permissions_required: item.protected,
      permissions_granted: [],
      approval_state: state === "WAITING_APPROVAL" ? "required" : "none",
      dependencies: [],
      routing_decision: routing,
      rejected_workers: rejected,
      retry_count: 0,
      lease_state: "none",
      blocked_reason: blocker,
      dead_letter_state: null,
      evidence: [
        {
          id: randomUUID(),
          kind: "request_text",
          digest: digest(text),
          stored_at: createdAt,
          ref: messageId,
        },
      ],
      subtask_ids: [],
      events,
      created_at: createdAt,
      updated_at: createdAt,
      completed_at: null,
    });
  }

  const parent: TaskRecord = {
    task_id: parentTaskId,
    message_id: messageId,
    conversation_id: conversationId,
    project_id: project.id,
    business_agent_id: "matter",
    domain: "orchestration",
    status: aggregateAck(subRecords) === "blocked" ? "BLOCKED" : aggregateAck(subRecords) === "awaiting_approval" ? "WAITING_APPROVAL" : "PLANNING",
    priority: "normal",
    owner: "mason",
    title: text.slice(0, 120),
    text,
    assigned_worker_id: null,
    assigned_provider: null,
    assigned_model: null,
    assigned_version: null,
    verifier_id: null,
    capabilities_required: {},
    capabilities_used: {},
    permissions_required: [],
    permissions_granted: [],
    approval_state: subRecords.some((t) => t.approval_state === "required") ? "required" : "none",
    dependencies: subRecords.map((t) => t.task_id),
    routing_decision: null,
    rejected_workers: subRecords.flatMap((t) => t.rejected_workers),
    retry_count: 0,
    lease_state: "none",
    blocked_reason: subRecords.find((t) => t.blocked_reason)?.blocked_reason || null,
    dead_letter_state: null,
    evidence: [
      {
        id: randomUUID(),
        kind: "request_text",
        digest: digest(text),
        stored_at: createdAt,
        ref: messageId,
      },
    ],
    subtask_ids: subRecords.map((t) => t.task_id),
    events: [
      event("message.received", text.slice(0, 200)),
      event("task.created", "Parent orchestration task"),
    ],
    created_at: createdAt,
    updated_at: createdAt,
    completed_at: null,
  };

  await mutateMatterRecords(async (store) => {
    store.clientMessageIndex[clientId] = {
      message_id: messageId,
      task_id: parentTaskId,
      conversation_id: conversationId,
    };
    store.conversations[conversationId] = {
      id: conversationId,
      project_id: project.id,
      created_at: store.conversations[conversationId]?.created_at || createdAt,
      updated_at: createdAt,
    };
    store.messages[messageId] = {
      message_id: messageId,
      conversation_id: conversationId,
      task_id: parentTaskId,
      client_message_id: clientId,
      text,
      source: input.source || "kituwa_web",
      attachments: input.attachments || [],
      client_created_at: input.client_created_at || createdAt,
      acknowledged_at: createdAt,
      created_at: createdAt,
    };
    store.tasks[parentTaskId] = parent;
    for (const t of subRecords) store.tasks[t.task_id] = t;
    const existingProject = store.projects[project.id];
    store.projects[project.id] = {
      project_id: project.id,
      name: project.name,
      domain: project.id,
      confidence: project.confidence,
      created_at: existingProject?.created_at || createdAt,
      updated_at: createdAt,
      task_ids: [...new Set([...(existingProject?.task_ids || []), parentTaskId, ...subRecords.map((t) => t.task_id)])],
    };
    return store;
  });

  await mutateKituwaState(async (state) => {
    const next = {
      ...state,
      project,
      requests: [
        ...state.requests,
        { id: parentTaskId, text, source: "text" as const, project, createdAt },
      ],
      messages: [
        ...state.messages,
        { id: messageId, role: "mason" as const, text, using: [], createdAt },
        {
          id: randomUUID(),
          role: "matter" as const,
          text: parent.blocked_reason
            ? `Saved. message_id ${messageId.slice(0, 8)} · task_id ${parentTaskId.slice(0, 8)}. Execution is not running. ${parent.blocked_reason}`
            : `Saved. message_id ${messageId.slice(0, 8)} · task_id ${parentTaskId.slice(0, 8)}.`,
          using: kituwaTasks
            .filter((t) => t.assignmentWorkerId)
            .map((t) => ({ worker_id: t.assignmentWorkerId as string, role: t.category })),
          createdAt,
        },
      ],
      plan,
      tasks: [...state.tasks, ...kituwaTasks],
      updatedAt: createdAt,
      matterStatus: (parent.status === "BLOCKED"
        ? "BLOCKED"
        : parent.status === "WAITING_APPROVAL"
          ? "WAITING_FOR_APPROVAL"
          : "WAITING") as typeof state.matterStatus,
    };
    return next;
  });

  return {
    ack: {
      message_id: messageId,
      task_id: parentTaskId,
      conversation_id: conversationId,
      status: aggregateAck([parent, ...subRecords]),
      acknowledged_at: createdAt,
      project_id: project.id,
      business_agent_id: "matter",
    },
    task: parent,
  };
}
