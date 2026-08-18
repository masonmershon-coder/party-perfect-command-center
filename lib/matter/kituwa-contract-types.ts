/** Durable Matter message/task contract types for Kituwa. */

export type MessageAckStatus = "accepted" | "blocked" | "awaiting_approval";

export type TaskLifecycleStatus =
  | "NEW"
  | "PLANNING"
  | "READY"
  | "ASSIGNED"
  | "RUNNING"
  | "WAITING"
  | "BLOCKED"
  | "WAITING_APPROVAL"
  | "VERIFYING"
  | "FAILED"
  | "COMPLETE"
  | "DEAD_LETTER";

export type TaskEventKind =
  | "message.received"
  | "task.created"
  | "routing.decided"
  | "worker.rejected"
  | "task.blocked"
  | "task.assigned"
  | "approval.required"
  | "task.updated";

export type TaskEvent = {
  id: string;
  kind: TaskEventKind;
  at: string;
  actor: string;
  detail: string;
  data?: Record<string, unknown>;
};

export type EvidenceRecord = {
  id: string;
  kind: string;
  digest: string;
  stored_at: string;
  ref: string | null;
};

export type RoutingSnapshot = {
  primary: string | null;
  verifier: string | null;
  blocked: boolean;
  route: string | null;
  selection_basis: string | null;
  owner_approval_required: boolean;
  considered: Array<{ worker_id: string; eligible: boolean; reasons: string[] }>;
};

export type RejectedWorker = {
  worker_id: string;
  provider: string | null;
  reasons: string[];
  heartbeat_at: string | null;
  trust_state: string;
};

export type ConversationRecord = {
  id: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageRecord = {
  message_id: string;
  conversation_id: string;
  task_id: string;
  client_message_id: string;
  text: string;
  source: string;
  attachments: Array<{ id: string; name: string; mime: string }>;
  client_created_at: string;
  acknowledged_at: string;
  created_at: string;
};

export type TaskRecord = {
  task_id: string;
  message_id: string;
  conversation_id: string;
  project_id: string | null;
  business_agent_id: string | null;
  domain: string;
  status: TaskLifecycleStatus;
  priority: "normal" | "low" | "high";
  owner: string;
  title: string;
  text: string;
  assigned_worker_id: string | null;
  assigned_provider: string | null;
  assigned_model: string | null;
  assigned_version: string | null;
  verifier_id: string | null;
  capabilities_required: Record<string, number | boolean>;
  capabilities_used: Record<string, number | boolean>;
  permissions_required: string[];
  permissions_granted: string[];
  approval_state: "none" | "required" | "approved" | "denied";
  dependencies: string[];
  routing_decision: RoutingSnapshot | null;
  rejected_workers: RejectedWorker[];
  retry_count: number;
  lease_state: "none" | "leased" | "expired";
  blocked_reason: string | null;
  dead_letter_state: string | null;
  evidence: EvidenceRecord[];
  subtask_ids: string[];
  events: TaskEvent[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type ProjectRecord = {
  project_id: string;
  name: string;
  domain: string;
  confidence: "high" | "low";
  created_at: string;
  updated_at: string;
  task_ids: string[];
};

export type MatterRecordsStore = {
  version: 2;
  clientMessageIndex: Record<
    string,
    { message_id: string; task_id: string; conversation_id: string }
  >;
  conversations: Record<string, ConversationRecord>;
  messages: Record<string, MessageRecord>;
  tasks: Record<string, TaskRecord>;
  projects: Record<string, ProjectRecord>;
  updatedAt: string;
};

export type MessageSubmitRequest = {
  client_message_id: string;
  conversation_id: string | null;
  text: string;
  attachments?: Array<{ id: string; name: string; mime: string }>;
  source: string;
  client_created_at: string;
};

export type MessageSubmitResponse = {
  message_id: string;
  task_id: string;
  conversation_id: string;
  status: MessageAckStatus;
  acknowledged_at: string;
  project_id: string | null;
  business_agent_id: string | null;
  duplicate?: boolean;
};

export type HealthMetricValue = {
  value: string;
  source: string;
  observed_at: string;
  last_success_at: string | null;
  stale_after: string | null;
  status: "ok" | "stale" | "unknown" | "degraded" | "unavailable";
  reason: string | null;
};

export function emptyMatterRecordsStore(): MatterRecordsStore {
  return {
    version: 2,
    clientMessageIndex: {},
    conversations: {},
    messages: {},
    tasks: {},
    projects: {},
    updatedAt: new Date(0).toISOString(),
  };
}
