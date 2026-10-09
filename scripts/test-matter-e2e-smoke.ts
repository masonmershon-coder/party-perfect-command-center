/**
 * Local end-to-end smoke: real Matter core modules (execution.mjs lease engine,
 * matter-registry.mjs router, trust.mjs verification gate) in a scratch MATTER_DIR, with
 * every lifecycle step mirrored through signed callbacks into a file-backed projection.
 *
 * Hermetic: scratch directories only, no network, no Redis/Supabase/POR, no production.
 * Wake: none. Workers are driven in-process (plus one real child process for the kill test);
 * no external transport wakes anything.
 *
 * Run: npx tsx scripts/test-matter-e2e-smoke.ts
 */
import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { FixedWindowRateLimiter, processMatterCallback, type CallbackLogEntry, type ProcessorDeps } from "../lib/matter/callback/processor";
import { parseKeyRing, signRequest } from "../lib/matter/callback/signature";
import { FileCallbackStore } from "../lib/matter/callback/store";

const REPO = path.resolve(__dirname, "..");
const MATTER_SRC = path.join(REPO, "AI-HANDOFF", "matter");
const SCRATCH = mkdtempSync(path.join(os.tmpdir(), "matter-e2e-"));
const MATTER_DIR = path.join(SCRATCH, "matter");
const CALLBACK_DIR = path.join(SCRATCH, "callback");

process.env.MATTER_DIR = MATTER_DIR;
process.env.MATTER_EXEC_DIR = MATTER_DIR;
process.env.MATTER_TRUST_AUTHORITY_TOKEN = randomBytes(24).toString("hex"); // scratch-only
delete process.env.VERCEL;

const results: Array<{ step: string; ok: boolean; detail: string }> = [];
function step(n: number, name: string, ok: boolean, detail: string) {
  results.push({ step: `${String(n).padStart(2, "0")} ${name}`, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${String(n).padStart(2, "0")} ${name} — ${detail}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(MATTER_DIR, { recursive: true });
  copyFileSync(path.join(MATTER_SRC, "MATTER_POLICY.json"), path.join(MATTER_DIR, "MATTER_POLICY.json"));

  const execUrl = pathToFileURL(path.join(MATTER_SRC, "execution.mjs")).href;
  const regUrl = pathToFileURL(path.join(MATTER_SRC, "matter-registry.mjs")).href;
  const trustUrl = pathToFileURL(path.join(MATTER_SRC, "trust.mjs")).href;
  const exec = await import(execUrl);
  const reg = await import(regUrl);
  const trust = await import(trustUrl);

  // ---- callback wiring -------------------------------------------------------
  const secrets = { matter: randomBytes(32).toString("hex"), a: randomBytes(32).toString("hex"), b: randomBytes(32).toString("hex") };
  const ring = parseKeyRing(
    JSON.stringify({
      "matter-core": { principal: "matter-core", role: "matter", domains: ["party_perfect"], secret: secrets.matter },
      "worker-builder-a": { principal: "builder-a", role: "worker", domains: ["party_perfect"], secret: secrets.a },
      "worker-builder-b": { principal: "builder-b", role: "worker", domains: ["party_perfect"], secret: secrets.b },
    }),
  );
  if (!ring.ok) throw new Error("smoke key ring invalid");
  const KEY = {
    matter: { key_id: "matter-core", secret: secrets.matter },
    "builder-a": { key_id: "worker-builder-a", secret: secrets.a },
    "builder-b": { key_id: "worker-builder-b", secret: secrets.b },
  } as const;
  const logs: CallbackLogEntry[] = [];
  let store = new FileCallbackStore(CALLBACK_DIR);
  const deps = (): ProcessorDeps => ({ keys: ring.keys, store, rateLimiter: limiter, log: (e) => logs.push(e) });
  const limiter = new FixedWindowRateLimiter(1000);
  let seq = 0;
  const mk = (e: Record<string, unknown>) => {
    seq += 1;
    return {
      schema_version: 1,
      event_id: `e2e-${String(seq).padStart(5, "0")}`,
      idempotency_key: `e2e:${String(seq).padStart(5, "0")}`,
      domain: "party_perfect",
      occurred_at: new Date().toISOString(),
      ...e,
    };
  };
  const post = async (body: Record<string, unknown>, signer: keyof typeof KEY = "matter") => {
    const raw = JSON.stringify(body);
    const headers = new Headers(signRequest(KEY[signer], raw, { timestamp: Date.now() / 1000, nonce: randomBytes(12).toString("hex") }));
    return processMatterCallback(headers, raw, deps());
  };
  const projected = async (taskId: string) => (await store.getTask("party_perfect", taskId))?.state ?? null;

  // ---- worker pool (scratch registry) ----------------------------------------
  const TRUE_BIN = ["/usr/bin/true"];
  const measured = (level: number) => ({ level, source: "measured", measured_at: new Date().toISOString() });
  for (const id of ["builder-a", "builder-b"]) {
    reg.register({ worker_id: id, provider: "test", detect: TRUE_BIN, cost_class: "subscription", capabilities: { coding: measured(3) }, permissions: { por_write: true } });
  }
  reg.register({ worker_id: "verifier-v", provider: "test", detect: TRUE_BIN, cost_class: "subscription", capabilities: { verification: measured(3) } });
  reg.grantPermission("verifier-v", "verification", true, { authority: process.env.MATTER_TRUST_AUTHORITY_TOKEN });
  for (const id of ["builder-a", "builder-b", "verifier-v"]) {
    reg.heartbeat(id, {});
    reg.ack(id);
    await post(mk({ event_type: "worker_registered", worker_id: id, capabilities: id === "verifier-v" ? ["verification"] : ["coding"] }));
  }
  reg.probe();

  const T1 = "PP-E2E-0001";
  const T2 = "PP-E2E-0002";

  // 1. intake -> one durable task
  exec.enqueue(T1, { artifacts: ["intake:e2e"] });
  exec.enqueue(T1, { artifacts: ["intake:e2e-dup"] });
  const leases1 = JSON.parse(readFileSync(path.join(MATTER_DIR, "LEASES.json"), "utf8"));
  const enqLog = exec.readLines(path.join(MATTER_DIR, "LEASE_LOG.jsonl")).filter((r: { event?: string; task_id?: string }) => r.event === "ENQUEUED" && r.task_id === T1);
  step(1, "intake creates one durable task", Object.keys(leases1.tasks).length === 1 && leases1.tasks[T1].state === "QUEUED" && enqLog.length === 1,
    `LEASES.json tasks=${Object.keys(leases1.tasks).length}, ENQUEUED rows=${enqLog.length}`);

  // 2. eligible worker chosen (+ independent verifier); self-granted permission ignored
  const decision = reg.route({ task_id: T1, required_capabilities: { coding: 2 }, risk_class: "security", objective: "e2e smoke" });
  const det = reg.route({ task_id: "PP-E2E-DET", objective: "check heartbeat age" });
  const selfGrantIgnored = !JSON.parse(readFileSync(path.join(MATTER_DIR, "WORKER_REGISTRY.json"), "utf8")).workers["builder-a"].permissions.por_write;
  const primary: string = decision.primary;
  step(2, "eligible worker chosen", !decision.blocked && ["builder-a", "builder-b"].includes(primary) && decision.verifier === "verifier-v" && primary !== decision.verifier
    && det.route === "DETERMINISTIC_SOFTWARE" && det.primary === null && selfGrantIgnored,
    `primary=${primary}, verifier=${decision.verifier}, basis="${decision.selection_basis}", deterministic route primary=${det.primary}, self-grant ignored=${selfGrantIgnored}`);
  const other = primary === "builder-a" ? "builder-b" : "builder-a";

  // 3. claim with lease
  const lease = exec.lease(T1, primary, { ttlSec: 300 });
  const r3 = await post(mk({ event_type: "task_claimed", task_id: T1, worker_id: primary, message_id: "MSG-E2E-1", lease: { lease_id: lease.lease_id, expires_at: lease.expires_at } }));
  step(3, "worker claims with lease", r3.status === 200 && r3.body.state === "CLAIMED" && JSON.parse(readFileSync(path.join(MATTER_DIR, "LEASES.json"), "utf8")).tasks[T1].state === "LEASED",
    `lease_id=${lease.lease_id}, callback=${r3.body.code}/${r3.body.state}`);
  let rivalRefused = false;
  try { exec.lease(T1, other, { ttlSec: 300 }); } catch { rivalRefused = true; }

  // 4. heartbeat renews lease
  await sleep(15);
  const before = lease.expires_at;
  const renewed = exec.renew(lease.lease_id, { ttlSec: 600 });
  exec.running(lease.lease_id);
  const r4 = await post(mk({ event_type: "heartbeat", task_id: T1, worker_id: primary, lease: { lease_id: lease.lease_id, expires_at: renewed.expires_at } }), primary as keyof typeof KEY);
  const proj4 = await store.getTask("party_perfect", T1);
  step(4, "heartbeat renews lease", Date.parse(renewed.expires_at) > Date.parse(before) && renewed.renewals === 1 && r4.body.state === "IN_PROGRESS" && proj4?.lease_expires_at === renewed.expires_at && rivalRefused,
    `expires ${before} -> ${renewed.expires_at}, projection=${r4.body.state}, rival lease refused=${rivalRefused}`);

  // 5. evidence returns
  trust.attachEvidence(T1, ["pr/e2e#commit-1"]);
  const r5 = await post(mk({ event_type: "evidence_submitted", task_id: T1, worker_id: primary, evidence: { digest: `sha256:${"1".repeat(64)}`, ref: "pr/e2e#commit-1" } }), primary as keyof typeof KEY);
  step(5, "evidence returns", r5.body.state === "AWAITING_VERIFICATION", `callback=${r5.body.code}/${r5.body.state}`);

  // 6 + 7. verifier rejects -> NEEDS_REPAIR
  const regFile = () => JSON.parse(readFileSync(path.join(MATTER_DIR, "WORKER_REGISTRY.json"), "utf8"));
  const gate = trust.checkIndependentVerification({ worker_id: primary, task_id: T1, verified_by: "verifier-v", registry: regFile(), policy: reg.policy() });
  const selfGate = trust.checkIndependentVerification({ worker_id: primary, task_id: T1, verified_by: primary, registry: regFile(), policy: reg.policy() });
  const r6 = await post(mk({ event_type: "verification_rejected", task_id: T1, worker_id: primary, verifier_id: "verifier-v", reason_code: "TESTS_FAILED" }));
  trust.logVerification({ task_id: T1, verifier: "verifier-v", decision: "REJECTED", reason: "TESTS_FAILED" });
  step(6, "verifier rejects", gate.ok === true && selfGate.code === "SELF_CERTIFICATION" && r6.status === 200,
    `gate(verifier-v)=${gate.ok ? "ok" : gate.code}, gate(self)=${selfGate.code}, callback=${r6.body.code}`);
  step(7, "task enters NEEDS_REPAIR", (await projected(T1)) === "NEEDS_REPAIR", `projection=${await projected(T1)}`);

  // 8. repair submitted
  const r8a = await post(mk({ event_type: "repair_started", task_id: T1, worker_id: primary }), primary as keyof typeof KEY);
  trust.attachEvidence(T1, ["pr/e2e#commit-2"]);
  const r8b = await post(mk({ event_type: "repair_submitted", task_id: T1, worker_id: primary, evidence: { digest: `sha256:${"2".repeat(64)}`, ref: "pr/e2e#commit-2" } }), primary as keyof typeof KEY);
  const proj8 = await store.getTask("party_perfect", T1);
  step(8, "repair submitted", r8a.body.state === "REPAIRING" && r8b.body.state === "AWAITING_VERIFICATION" && proj8?.repair_attempts === 1,
    `repair_started=${r8a.body.state}, repair_submitted=${r8b.body.state}, repair_attempts=${proj8?.repair_attempts}`);

  // 9. verifier passes (builder cannot)
  const selfPass = await post(mk({ event_type: "verification_passed", task_id: T1, worker_id: primary, verifier_id: primary }));
  const gate9 = trust.checkIndependentVerification({ worker_id: primary, task_id: T1, verified_by: "verifier-v", registry: regFile(), policy: reg.policy() });
  const r9 = await post(mk({ event_type: "verification_passed", task_id: T1, worker_id: primary, verifier_id: "verifier-v" }));
  trust.logVerification({ task_id: T1, verifier: "verifier-v", decision: "PASSED" });
  step(9, "verifier passes", gate9.ok === true && r9.body.state === "VERIFIED" && selfPass.body.code === "VERIFIER_NOT_INDEPENDENT",
    `gate=${gate9.ok ? "ok" : gate9.code}, callback=${r9.body.state}, self-pass=${selfPass.body.code}`);

  // 10. task closes
  exec.complete(lease.lease_id, { verified_by: "verifier-v" });
  const closeBody = mk({ event_type: "task_closed", task_id: T1, worker_id: primary });
  const r10 = await post(closeBody);
  const execState = JSON.parse(readFileSync(path.join(MATTER_DIR, "LEASES.json"), "utf8")).tasks[T1].state;
  step(10, "task closes", r10.body.state === "CLOSED" && execState === "SUCCEEDED", `callback=${r10.body.state}, execution=${execState}`);

  // 11. duplicate delivery -> no duplicate effect
  const auditBefore = (await store.listAudit()).filter((a) => a.outcome === "accepted").length;
  const versionBefore = (await store.getTask("party_perfect", T1))?.version;
  const dups = await Promise.all(Array.from({ length: 8 }, () => post(closeBody)));
  exec.enqueue(T1, { artifacts: ["late-duplicate-intake"] });
  const auditAfter = (await store.listAudit()).filter((a) => a.outcome === "accepted").length;
  const versionAfter = (await store.getTask("party_perfect", T1))?.version;
  const execAfter = JSON.parse(readFileSync(path.join(MATTER_DIR, "LEASES.json"), "utf8")).tasks[T1];
  step(11, "duplicate delivery creates no duplicate effect",
    dups.every((d) => d.status === 200 && d.body.duplicate === true && d.body.audit_id === r10.body.audit_id) && auditAfter === auditBefore && versionAfter === versionBefore && execAfter.state === "SUCCEEDED" && execAfter.attempts === 1,
    `8 parallel redeliveries all duplicate=${dups.every((d) => d.body.duplicate)}, accepted audit ${auditBefore}->${auditAfter}, version ${versionBefore}->${versionAfter}, execution attempts=${execAfter.attempts}`);

  // 12. killed worker's lease expires and is reclaimed
  exec.enqueue(T2);
  const childSrc = `
    const exec = await import(${JSON.stringify(execUrl)});
    const l = exec.lease(${JSON.stringify(T2)}, ${JSON.stringify(primary)}, { ttlSec: 1 });
    process.stdout.write(JSON.stringify(l) + "\\n");
    setInterval(() => { try { exec.renew(l.lease_id, { ttlSec: 1 }); } catch {} }, 200);
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", childSrc], {
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "/usr/bin:/bin", MATTER_EXEC_DIR: MATTER_DIR, HOME: SCRATCH },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((r) => child.on("exit", (code, signal) => r({ code, signal })));
  const childLease = await new Promise<{ lease_id: string; expires_at: string }>((resolve, reject) => {
    let buf = "";
    child.stdout.on("data", (d) => {
      buf += d;
      const line = buf.split("\n")[0];
      if (buf.includes("\n")) {
        try { resolve(JSON.parse(line)); } catch (e) { reject(e); }
      }
    });
    setTimeout(() => reject(new Error("child did not lease")), 10_000);
  });
  await post(mk({ event_type: "task_claimed", task_id: T2, worker_id: primary, lease: { lease_id: childLease.lease_id, expires_at: childLease.expires_at } }));
  await sleep(700);
  const aliveReclaim = exec.reclaim();
  const renewalsWhileAlive = JSON.parse(readFileSync(path.join(MATTER_DIR, "LEASES.json"), "utf8")).tasks[T2].lease?.renewals ?? 0;
  child.kill("SIGKILL");
  const exit = await exited;
  await sleep(1300);
  const reclaimed = exec.reclaim();
  const r12a = await post(mk({ event_type: "lease_expired", task_id: T2, worker_id: primary, reason_code: "LEASE_EXPIRED" }));
  const lease2 = exec.lease(T2, other, { ttlSec: 300 });
  const r12b = await post(mk({ event_type: "task_claimed", task_id: T2, worker_id: other, lease: { lease_id: lease2.lease_id, expires_at: lease2.expires_at } }));
  const proj12 = await store.getTask("party_perfect", T2);
  const staleWorker = await post(mk({ event_type: "heartbeat", task_id: T2, worker_id: primary, lease: { lease_id: childLease.lease_id, expires_at: childLease.expires_at } }), primary as keyof typeof KEY);
  step(12, "killed worker's lease expires and is reclaimed",
    !aliveReclaim.reclaimed.includes(T2) && renewalsWhileAlive > 0 && exit.signal === "SIGKILL" && reclaimed.reclaimed.includes(T2) && r12a.body.state === "QUEUED"
      && r12b.body.state === "CLAIMED" && proj12?.assigned_worker === other && proj12?.retries === 1 && lease2.lease_id.endsWith("-2") && staleWorker.body.code === "NOT_LEASE_HOLDER",
    `live renewals=${renewalsWhileAlive}, not reclaimed while alive, child ${exit.signal}, reclaimed=${JSON.stringify(reclaimed.reclaimed)}, reclaimed by ${other} (${lease2.lease_id}), retries=${proj12?.retries}, killed worker's late heartbeat=${staleWorker.body.code}`);

  // 13. stale event cannot reopen the closed task
  const stale = await Promise.all([
    post(mk({ event_type: "task_claimed", task_id: T1, worker_id: other, lease: { lease_id: "L-STALE-9", expires_at: new Date(Date.now() + 60_000).toISOString() } })),
    post(mk({ event_type: "lease_expired", task_id: T1, worker_id: primary })),
    post(mk({ event_type: "verification_rejected", task_id: T1, worker_id: primary, verifier_id: "verifier-v", reason_code: "LATE" })),
    post(mk({ event_type: "heartbeat", task_id: T1, worker_id: primary }), primary as keyof typeof KEY),
  ]);
  let execRefused = false;
  try { exec.lease(T1, other, { ttlSec: 60 }); } catch { execRefused = true; }
  store = new FileCallbackStore(CALLBACK_DIR); // reload from disk
  step(13, "stale event cannot reopen closed task",
    stale.every((s) => s.body.code === "TASK_TERMINAL") && execRefused && (await projected(T1)) === "CLOSED",
    `stale codes=${stale.map((s) => s.body.code).join(",")}, execution lease refused=${execRefused}, reloaded projection=${await projected(T1)}`);

  // secrets never in responses/logs/disk
  const disk = readFileSync(path.join(CALLBACK_DIR, "CALLBACK_STATE.json"), "utf8") + readFileSync(path.join(CALLBACK_DIR, "CALLBACK_AUDIT.jsonl"), "utf8");
  const blob = JSON.stringify(logs) + disk;
  const leaked = [...Object.values(secrets), process.env.MATTER_TRUST_AUTHORITY_TOKEN!].some((s) => blob.includes(s));
  console.log(`${leaked ? "FAIL" : "PASS"} extra secrets absent from callback logs and store files`);

  console.log("WAKE: none — no external transport was exercised; workers were driven in-process.");
  const failedSteps = results.filter((r) => !r.ok);
  console.log(`\nmatter-e2e-smoke: ${results.length - failedSteps.length}/${results.length} steps passed`);
  if (failedSteps.length || leaked) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("matter-e2e-smoke: crashed", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => {
    rmSync(SCRATCH, { recursive: true, force: true });
  });
