import { randomUUID } from "node:crypto";
import { deriveWorkItems, inferProject, initialPlan } from "@/lib/kituwa/plan";
import { routeWithMatter } from "@/lib/kituwa/matter-bridge";
import { mutateKituwaState } from "@/lib/kituwa/store";
import type {
  KituwaMessage,
  KituwaState,
  KituwaTask,
  MatterUiStatus,
} from "@/lib/kituwa/types";

function nowIso() {
  return new Date().toISOString();
}

function aggregateStatus(tasks: KituwaTask[]): MatterUiStatus {
  if (tasks.some((t) => t.state === "RUNNING")) return "BUILDING";
  if (tasks.some((t) => t.state === "VERIFYING")) return "VERIFYING";
  if (tasks.some((t) => t.state === "WAITING_APPROVAL")) return "WAITING_FOR_APPROVAL";
  if (tasks.some((t) => t.state === "BLOCKED")) return "BLOCKED";
  if (tasks.some((t) => t.state === "WAITING" || t.state === "ASSIGNED" || t.state === "READY")) {
    return "WAITING";
  }
  if (tasks.length && tasks.every((t) => t.state === "COMPLETE")) return "COMPLETE";
  return "IDLE";
}

function matterReply(state: KituwaState): KituwaMessage {
  const project = state.project?.confidence === "high" ? state.project.name : "this work";
  const blocked = state.tasks.filter((t) => t.state === "BLOCKED" || t.state === "WAITING");
  const using = state.tasks
    .filter((t) => t.assignmentWorkerId)
    .map((t) => ({
      worker_id: t.assignmentWorkerId as string,
      role: t.category,
    }));
  const uniqueUsing = [...new Map(using.map((u) => [u.worker_id + u.role, u])).values()];

  let text = `I've organized ${project}. The request is saved and will survive if you close this screen.`;
  if (blocked.length) {
    const reasons = [...new Set(blocked.map((t) => t.blocker).filter(Boolean))];
    text += ` Execution is not running. ${reasons[0] || "No eligible worker with a fresh heartbeat."}`;
  }
  text += " I will not deploy, spend, or message anyone without your approval.";

  return {
    id: randomUUID(),
    role: "matter",
    text,
    using: uniqueUsing,
    createdAt: nowIso(),
  };
}

export async function handleTalk(input: {
  text: string;
  source: "text" | "voice" | "attachment";
}): Promise<KituwaState> {
  const text = input.text.trim();
  if (!text) throw new Error("empty request");

  return mutateKituwaState(async (state) => {
    const project = inferProject(text);
    const requestId = randomUUID();
    const createdAt = nowIso();
    const work = deriveWorkItems(text);
    const plan = initialPlan(text, project);

    const tasks: KituwaTask[] = [];
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

      let taskState: KituwaTask["state"] = "READY";
      let blocker: string | null = null;
      let hat: string | null = item.hat;
      if (routing.owner_approval_required) {
        taskState = "WAITING_APPROVAL";
        blocker = "Protected action — waiting for Mason.";
      } else if (routing.blocked || !routing.primary) {
        taskState = "BLOCKED";
        blocker =
          routing.selection_basis ||
          "No eligible worker (capability, permission, probe, or fresh heartbeat).";
        hat = item.hat;
      } else {
        taskState = "ASSIGNED";
        hat = item.hat;
      }

      tasks.push({
        id,
        requestId,
        title: item.title,
        category: item.category,
        state: taskState,
        requiredCapabilities: item.capabilities,
        protectedActions: item.protected,
        assignmentHat: hat,
        assignmentWorkerId: routing.primary,
        routing,
        blocker,
        createdAt,
        updatedAt: createdAt,
      });
    }

    const nextPlan = plan.map((step) => {
      if (step.id === "understand" || step.id === "persist") return step;
      if (step.id === "project") return step;
      const match = tasks.find((t) => step.label === t.title);
      if (!match) {
        if (step.id === "verify") {
          const v = tasks.find((t) => t.category === "verification");
          if (!v) return step;
          if (v.state === "BLOCKED") return { ...step, status: "blocked" as const, detail: v.blocker || step.detail };
          if (v.state === "ASSIGNED") return { ...step, status: "pending" as const };
        }
        if (step.id === "delivery") return { ...step, status: "pending" as const };
        return step;
      }
      if (match.state === "BLOCKED") {
        return { ...step, status: "blocked" as const, detail: match.blocker || undefined };
      }
      if (match.state === "WAITING_APPROVAL") {
        return { ...step, status: "waiting" as const, detail: match.blocker || undefined };
      }
      if (match.state === "ASSIGNED" || match.state === "READY") {
        return { ...step, status: "pending" as const, detail: "Queued. No worker is running it yet." };
      }
      return step;
    });

    const next: KituwaState = {
      ...state,
      matterStatus: "PLANNING",
      project,
      requests: [
        ...state.requests,
        {
          id: requestId,
          text,
          source: input.source,
          project,
          createdAt,
        },
      ],
      messages: [
        ...state.messages,
        { id: randomUUID(), role: "mason", text, using: [], createdAt },
      ],
      plan: nextPlan,
      tasks: [...state.tasks.filter((t) => t.requestId !== requestId), ...tasks],
      updatedAt: createdAt,
    };
    next.matterStatus = aggregateStatus(next.tasks);
    next.messages = [...next.messages, matterReply(next)];
    return next;
  });
}

export function liveStations(state: KituwaState) {
  return state.tasks.map((task) => ({
    id: task.id,
    hat: task.assignmentHat || task.category.toUpperCase(),
    workerId: task.assignmentWorkerId,
    state: task.state,
    title: task.title,
    busy: task.state === "RUNNING",
    blocked: task.state === "BLOCKED" || task.state === "WAITING_APPROVAL",
  }));
}
