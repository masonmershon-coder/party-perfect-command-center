export const KITUWA_TASK_STATES = [
  "NEW",
  "PLANNING",
  "READY",
  "ASSIGNED",
  "RUNNING",
  "WAITING",
  "BLOCKED",
  "WAITING_APPROVAL",
  "VERIFYING",
  "FAILED",
  "COMPLETE",
] as const;

export type KituwaTaskState = (typeof KITUWA_TASK_STATES)[number];

export type MatterUiStatus =
  | "IDLE"
  | "LISTENING"
  | "THINKING"
  | "PLANNING"
  | "BUILDING"
  | "VERIFYING"
  | "WAITING_FOR_APPROVAL"
  | "COMPLETE"
  | "BLOCKED"
  | "WAITING";

export type PlanStepStatus = "done" | "active" | "pending" | "blocked" | "waiting";

export type KituwaPlanStep = {
  id: string;
  label: string;
  status: PlanStepStatus;
  detail?: string;
};

export type KituwaProject = {
  id: string;
  name: string;
  inferred: boolean;
  confidence: "high" | "low";
};

export type KituwaAttachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "audio" | "document" | "other";
  stored: "inline" | "meta_only";
};

export type KituwaRouting = {
  primary: string | null;
  verifier: string | null;
  blocked: boolean;
  route: string | null;
  selection_basis: string | null;
  owner_approval_required: boolean;
  considered: Array<{
    worker_id: string;
    eligible: boolean;
    reasons: string[];
  }>;
};

export type KituwaTask = {
  id: string;
  requestId: string;
  title: string;
  category: string;
  state: KituwaTaskState;
  requiredCapabilities: Record<string, number | boolean>;
  protectedActions: string[];
  assignmentHat: string | null;
  assignmentWorkerId: string | null;
  routing: KituwaRouting | null;
  blocker: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KituwaMessage = {
  id: string;
  role: "mason" | "matter";
  text: string;
  using: Array<{ worker_id: string; role: string }>;
  createdAt: string;
};

export type KituwaRequest = {
  id: string;
  text: string;
  source: "text" | "voice" | "attachment";
  project: KituwaProject;
  createdAt: string;
};

export type KituwaWorkerPulse = {
  worker_id: string;
  at: string;
  available: boolean;
};

export type KituwaState = {
  version: 1;
  matterStatus: MatterUiStatus;
  project: KituwaProject | null;
  requests: KituwaRequest[];
  messages: KituwaMessage[];
  plan: KituwaPlanStep[];
  tasks: KituwaTask[];
  attachments: KituwaAttachment[];
  workerPulses: KituwaWorkerPulse[];
  updatedAt: string;
};

export function emptyKituwaState(): KituwaState {
  return {
    version: 1,
    matterStatus: "IDLE",
    project: null,
    requests: [],
    messages: [],
    plan: [],
    tasks: [],
    attachments: [],
    workerPulses: [],
    updatedAt: new Date(0).toISOString(),
  };
}
