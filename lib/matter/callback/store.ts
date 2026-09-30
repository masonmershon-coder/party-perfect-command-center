import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import type {
  AuditRecord,
  CallbackEvent,
  CallbackResponseBody,
  TaskProjection,
  WorkerProjection,
} from "./contract";

export type IdempotentRecord = {
  scope: string;
  body_sha256: string;
  status: number;
  response: CallbackResponseBody;
  recorded_at: string;
};

export type DeadLetterEntry = {
  dlq_id: string;
  failed_at: string;
  reason: string;
  attempts: number;
  event: CallbackEvent;
};

export type CommitInput = {
  idempotency: IdempotentRecord;
  audit: AuditRecord;
  task?: TaskProjection;
  worker?: WorkerProjection;
};

/**
 * Persistence for the callback projection. Every method is async so a Redis / AI Core
 * implementation can replace these without touching the processor.
 *
 * Contract:
 *  - recordNonce is an atomic check-and-set (true = first sighting).
 *  - commit applies idempotency record + projection change + audit row as one unit.
 *  - audit is append-only; there is no update or delete.
 */
export interface CallbackStore {
  readonly kind: string;
  recordNonce(scope: string, nowMs: number, expiresAtMs: number): Promise<boolean>;
  getIdempotent(scope: string): Promise<IdempotentRecord | null>;
  getTask(domain: string, taskId: string): Promise<TaskProjection | null>;
  getWorker(workerId: string): Promise<WorkerProjection | null>;
  commit(input: CommitInput): Promise<void>;
  appendAudit(record: AuditRecord): Promise<void>;
  deadLetter(entry: DeadLetterEntry): Promise<void>;
  listAudit(): Promise<readonly AuditRecord[]>;
  listDeadLetters(): Promise<readonly DeadLetterEntry[]>;
  listTasks(): Promise<readonly TaskProjection[]>;
}

type State = {
  version: 1;
  nonces: Record<string, number>;
  idempotency: Record<string, IdempotentRecord>;
  tasks: Record<string, TaskProjection>;
  workers: Record<string, WorkerProjection>;
  audit: AuditRecord[];
  dead_letters: DeadLetterEntry[];
};

const emptyState = (): State => ({
  version: 1,
  nonces: {},
  idempotency: {},
  tasks: {},
  workers: {},
  audit: [],
  dead_letters: [],
});

const taskKey = (domain: string, taskId: string) => `${domain}|${taskId}`;
const clone = <T>(v: T): T => (v === undefined || v === null ? v : (JSON.parse(JSON.stringify(v)) as T));

/**
 * Synchronous core shared by both stores. Every mutation completes without an await, so
 * within one Node process a check-and-set cannot interleave with another request.
 */
class StateStore implements CallbackStore {
  readonly kind: string;
  protected state: State;

  constructor(kind: string, initial: State = emptyState()) {
    this.kind = kind;
    this.state = initial;
  }

  protected persist(): void {}

  async recordNonce(scope: string, nowMs: number, expiresAtMs: number): Promise<boolean> {
    for (const [k, exp] of Object.entries(this.state.nonces)) if (exp < nowMs) delete this.state.nonces[k];
    if (this.state.nonces[scope] !== undefined) return false;
    this.state.nonces[scope] = expiresAtMs;
    this.persist();
    return true;
  }

  async getIdempotent(scope: string) {
    return clone(this.state.idempotency[scope] ?? null);
  }

  async getTask(domain: string, taskId: string) {
    return clone(this.state.tasks[taskKey(domain, taskId)] ?? null);
  }

  async getWorker(workerId: string) {
    return clone(this.state.workers[workerId] ?? null);
  }

  async commit(input: CommitInput) {
    if (this.state.idempotency[input.idempotency.scope]) {
      throw new Error("idempotency scope already committed");
    }
    const next = clone(this.state);
    next.idempotency[input.idempotency.scope] = clone(input.idempotency);
    if (input.task) next.tasks[taskKey(input.task.domain, input.task.task_id)] = clone(input.task);
    if (input.worker) next.workers[input.worker.worker_id] = clone(input.worker);
    next.audit.push(Object.freeze(clone(input.audit)));
    const prev = this.state;
    this.state = next;
    try {
      this.persist();
    } catch (e) {
      this.state = prev;
      throw e;
    }
  }

  async appendAudit(record: AuditRecord) {
    this.state.audit.push(Object.freeze(clone(record)));
    this.persist();
  }

  async deadLetter(entry: DeadLetterEntry) {
    this.state.dead_letters.push(clone(entry));
    this.persist();
  }

  async listAudit() {
    return Object.freeze(this.state.audit.map((a) => clone(a)));
  }

  async listDeadLetters() {
    return Object.freeze(this.state.dead_letters.map((d) => clone(d)));
  }

  async listTasks() {
    return Object.freeze(Object.values(this.state.tasks).map((t) => clone(t)));
  }
}

/** Process-local store. Default for preview: nothing leaves the isolate. */
export class MemoryCallbackStore extends StateStore {
  constructor() {
    super("memory");
  }
}

/**
 * Local-disk store for development and the end-to-end smoke. The state file is replaced
 * atomically (tmp + rename); AUDIT.jsonl is an append-only mirror of the audit rows.
 * Refuses to run on Vercel so it can never become an accidental production store.
 */
export class FileCallbackStore extends StateStore {
  private readonly file: string;
  private readonly auditMirror: string;
  private mirrored: number;

  constructor(dir: string) {
    if (process.env.VERCEL) throw new Error("FileCallbackStore is local-only and refuses to run on Vercel");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "CALLBACK_STATE.json");
    let initial = emptyState();
    if (existsSync(file)) initial = JSON.parse(readFileSync(file, "utf8")) as State;
    super("file", initial);
    this.file = file;
    this.auditMirror = path.join(dir, "CALLBACK_AUDIT.jsonl");
    this.mirrored = initial.audit.length;
  }

  protected persist(): void {
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
    const pending = this.state.audit.slice(this.mirrored);
    if (pending.length) {
      appendFileSync(this.auditMirror, pending.map((a) => JSON.stringify(a)).join("\n") + "\n", { mode: 0o600 });
      this.mirrored = this.state.audit.length;
    }
  }
}
