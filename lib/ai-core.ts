/**
 * AI CORE — access layer for the Mershon AI shared contract (P1).
 *
 * NEUTRAL infrastructure. It knows DOMAINS, not personas. "Mike" (party_perfect)
 * and "Matter" (mershon_personal) are app-layer personas; this file never hardcodes them.
 *
 * FOUR SEPARATE CONCEPTS:
 *   - actor    = the authenticated identity (e.g. Mason)
 *   - persona  = the app-layer AI identity the user addresses (Matter / Mike) — NOT here
 *   - domain   = whose CONTEXT + authority the work belongs to (party_perfect, mershon_personal, mershon:<member>)
 *   - executor = the WORKER that does it (claude, cursor, chatgpt, grok, human, gateway)
 * The same executor (e.g. Claude) can operate in any domain; the domain decides scope.
 *
 * IDENTITY GOVERNS DOMAIN: this layer requires a `domain` on every write, but it is the
 * GATEWAY's job (later) to derive/approve that domain from the authenticated actor — a
 * client-supplied domain string is never authorization.
 *
 * `domain` is REQUIRED on every write — no silent default — so a personal record can
 * never fall into business context by accident.
 *
 * P1 = data contract only. No gateway, no dispatch, no external actions here.
 * Requires: pg + DATABASE_URL (Supabase transaction pooler; not applied until approved).
 */
import pg from "pg";
import { isValidTransactionPoolerUri } from "./supabase-probe";

export type Domain = string; // "party_perfect" | "mershon_personal" | `mershon:${string}`
export type Executor = "claude" | "cursor" | "chatgpt" | "grok" | "human" | "mike" | "madison" | "gateway" | string;
export type ExecutionMode = "human_handoff" | "manual_agent" | "automatic_agent";
export type TaskStatus = "NEW" | "READY" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";
export type BrainStatus =
  | "DISCUSSION" | "PROPOSAL" | "DECISION" | "VERIFIED_FACT"
  | "UNVERIFIED_CLAIM" | "POLICY" | "SUPERSEDED" | "PENDING_REVIEW";

// --- connection (globalThis-cached; serverless-safe per review finding #5) ---
const g = globalThis as unknown as { __aiCorePool?: pg.Pool };
function db(): pg.Pool {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("ai_core: DATABASE_URL not set");
  if (!g.__aiCorePool) {
    g.__aiCorePool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      ssl: { rejectUnauthorized: false },
    });
  }
  return g.__aiCorePool;
}
export function isAiCoreConfigured(): boolean {
  return isValidTransactionPoolerUri(process.env.DATABASE_URL);
}
function requireDomain(domain: string | undefined | null): string {
  const d = (domain || "").trim();
  if (!d) throw new Error("ai_core: domain is required (no default — pass party_perfect / mershon_personal / mershon:<member>)");
  return d;
}

// --- tasks ---
export type NewTask = {
  domain: Domain;
  title: string;
  type?: string;
  source?: string;
  intent?: string;
  inputContext?: Record<string, unknown>; // references, not copies
  suggestedExecutor?: Executor;
  assignedExecutor?: Executor;
  executionMode?: ExecutionMode;
  approvalRequired?: boolean;
  priority?: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
  createdBy?: string;
  sourceReference?: string;
};

export async function createTask(t: NewTask): Promise<{ id: string }> {
  const domain = requireDomain(t.domain);
  const { rows } = await db().query(
    `insert into ai_core.tasks
       (domain, title, type, source, intent, input_context, suggested_executor, assigned_executor,
        execution_mode, approval_required, priority, due_date, created_by, source_reference)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,coalesce($9,'human_handoff'),coalesce($10,false),
             coalesce($11,'medium'),$12,$13,$14)
     returning id`,
    [domain, t.title, t.type ?? null, t.source ?? null, t.intent ?? null,
     JSON.stringify(t.inputContext ?? {}), t.suggestedExecutor ?? null, t.assignedExecutor ?? null,
     t.executionMode ?? null, t.approvalRequired ?? null, t.priority ?? null, t.dueDate ?? null,
     t.createdBy ?? null, t.sourceReference ?? null]
  );
  await logAudit({ domain, actor: t.createdBy ?? "system", action: "task.create", entityType: "task", entityId: rows[0].id });
  return { id: rows[0].id };
}

export async function updateTask(id: string, patch: Partial<{ status: TaskStatus; assignedExecutor: Executor; result: string; outputArtifacts: unknown[]; executionMode: ExecutionMode }>): Promise<void> {
  const sets: string[] = ["updated_at = now()"]; const vals: unknown[] = []; let i = 1;
  const add = (col: string, v: unknown) => { sets.push(`${col} = $${i++}`); vals.push(v); };
  if (patch.status) add("status", patch.status);
  if (patch.assignedExecutor) add("assigned_executor", patch.assignedExecutor);
  if (patch.result !== undefined) add("result", patch.result);
  if (patch.outputArtifacts) add("output_artifacts", JSON.stringify(patch.outputArtifacts));
  if (patch.executionMode) add("execution_mode", patch.executionMode);
  vals.push(id);
  await db().query(`update ai_core.tasks set ${sets.join(", ")} where id = $${i}`, vals);
}

export async function listTasks(filter: { domain: Domain; status?: TaskStatus; executor?: Executor; limit?: number }): Promise<Record<string, unknown>[]> {
  const domain = requireDomain(filter.domain);
  const where = ["domain = $1"]; const vals: unknown[] = [domain]; let i = 2;
  if (filter.status) { where.push(`status = $${i++}`); vals.push(filter.status); }
  if (filter.executor) { where.push(`assigned_executor = $${i++}`); vals.push(filter.executor); }
  vals.push(Math.min(filter.limit ?? 100, 500));
  const { rows } = await db().query(`select * from ai_core.tasks where ${where.join(" and ")} order by created_at desc limit $${i}`, vals);
  return rows;
}

// --- approvals (choke point) ---
export async function createApproval(a: { domain: Domain; taskId?: string; summary: string; risk?: "external" | "financial" | "irreversible" | "deletion" | "other" }): Promise<{ id: string }> {
  const domain = requireDomain(a.domain);
  const { rows } = await db().query(
    `insert into ai_core.approvals (domain, task_id, summary, risk) values ($1,$2,$3,$4) returning id`,
    [domain, a.taskId ?? null, a.summary, a.risk ?? null]
  );
  await logAudit({ domain, actor: "gateway", action: "approval.request", entityType: "approval", entityId: rows[0].id });
  return { id: rows[0].id };
}

export async function decideApproval(id: string, decision: "APPROVED" | "REJECTED", decidedBy: string, note?: string): Promise<void> {
  const { rows } = await db().query(
    `update ai_core.approvals set status=$2, decided_by=$3, decided_at=now(), note=$4 where id=$1 returning domain`,
    [id, decision, decidedBy, note ?? null]
  );
  const domain = rows[0]?.domain ?? "unknown";
  await logAudit({ domain, actor: decidedBy, action: `approval.${decision.toLowerCase()}`, entityType: "approval", entityId: id });
}

// --- brain records (status-tagged knowledge) ---
export async function upsertBrainRecord(r: {
  domain: Domain; status: BrainStatus; title: string; body?: string; docRef?: string;
  source?: string; sourceReference?: string; createdBy?: string; approvedBy?: string;
  effectiveDate?: string; confidence?: "low" | "medium" | "high"; supersedes?: string;
  relatedMeeting?: string; relatedProject?: string;
}): Promise<{ id: string }> {
  const domain = requireDomain(r.domain);
  const { rows } = await db().query(
    `insert into ai_core.brain_records
       (domain, status, title, body, doc_ref, source, source_reference, created_by, approved_by,
        effective_date, confidence, supersedes, related_meeting, related_project)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
    [domain, r.status, r.title, r.body ?? null, r.docRef ?? null, r.source ?? null, r.sourceReference ?? null,
     r.createdBy ?? null, r.approvedBy ?? null, r.effectiveDate ?? null, r.confidence ?? null,
     r.supersedes ?? null, r.relatedMeeting ?? null, r.relatedProject ?? null]
  );
  await logAudit({ domain, actor: r.createdBy ?? "system", action: "brain.upsert", entityType: "brain_record", entityId: rows[0].id });
  return { id: rows[0].id };
}

export async function listBrainRecords(filter: { domain: Domain; status?: BrainStatus; limit?: number }): Promise<Record<string, unknown>[]> {
  const domain = requireDomain(filter.domain);
  const where = ["domain = $1"]; const vals: unknown[] = [domain]; let i = 2;
  if (filter.status) { where.push(`status = $${i++}`); vals.push(filter.status); }
  vals.push(Math.min(filter.limit ?? 100, 500));
  const { rows } = await db().query(`select * from ai_core.brain_records where ${where.join(" and ")} order by created_at desc limit $${i}`, vals);
  return rows;
}

// --- artifacts (pointers to big files) ---
/**
 * Idempotent on content identity: SAME DOMAIN + SAME sha256 -> reuse the existing row.
 *
 * Backed by the partial unique index applied in 0004:
 *   ux_artifacts_domain_sha256 ON (domain, sha256) WHERE sha256 IS NOT NULL
 *
 * The ON CONFLICT clause repeats that predicate because Postgres cannot infer a
 * partial index without it. DO UPDATE (not DO NOTHING) so a conflicting insert
 * still returns the existing row — DO NOTHING returns zero rows and callers
 * expect an id back.
 *
 * Rows with a NULL sha256 keep the previous behavior: they never collide
 * (they fall outside the index predicate) and always insert a new row.
 *
 * `reused` tells the caller whether this content was already known, so
 * expensive downstream work (transcription, extraction) can be skipped —
 * see processing_status / processing_result_ref on the same table.
 */
export async function indexArtifact(a: { domain: Domain; kind?: string; location?: string; pathOrUrl?: string; sha256?: string; bytes?: number; relatedTask?: string; relatedMeeting?: string }): Promise<{ id: string; reused: boolean }> {
  const domain = requireDomain(a.domain);
  const { rows } = await db().query(
    `insert into ai_core.artifacts (domain, kind, location, path_or_url, sha256, bytes, related_task, related_meeting)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (domain, sha256) where sha256 is not null
     do update set updated_at = now()
     returning id, (xmax <> 0) as reused`,
    [domain, a.kind ?? null, a.location ?? null, a.pathOrUrl ?? null, a.sha256 ?? null, a.bytes ?? null, a.relatedTask ?? null, a.relatedMeeting ?? null]
  );
  return { id: rows[0].id, reused: Boolean(rows[0].reused) };
}

// --- audit (append-only, domain-attributable) ---
export async function logAudit(e: { domain: Domain; actor?: string; action: string; entityType?: string; entityId?: string; detail?: Record<string, unknown> }): Promise<void> {
  const domain = requireDomain(e.domain);
  await db().query(
    `insert into ai_core.audit_log (domain, actor, action, entity_type, entity_id, detail) values ($1,$2,$3,$4,$5,$6::jsonb)`,
    [domain, e.actor ?? null, e.action, e.entityType ?? null, e.entityId ?? null, JSON.stringify(e.detail ?? {})]
  );
}

// --- approvals: read (for the phone approvals inbox) ---
export async function listApprovals(filter: { domain: Domain; status?: "PENDING" | "APPROVED" | "REJECTED"; limit?: number }): Promise<Record<string, unknown>[]> {
  const domain = requireDomain(filter.domain);
  const where = ["domain = $1"]; const vals: unknown[] = [domain]; let i = 2;
  if (filter.status) { where.push(`status = $${i++}`); vals.push(filter.status); }
  vals.push(Math.min(filter.limit ?? 100, 500));
  const { rows } = await db().query(`select * from ai_core.approvals where ${where.join(" and ")} order by requested_at desc limit $${i}`, vals);
  return rows;
}

/** For server-side domain-authorization checks before deciding an approval. */
export async function getApprovalDomain(id: string): Promise<string | null> {
  const { rows } = await db().query(`select domain from ai_core.approvals where id = $1`, [id]);
  return (rows[0]?.domain as string) ?? null;
}
