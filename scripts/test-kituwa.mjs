#!/usr/bin/env npx tsx
/**
 * KITUWA V1 hermetic tests. No production credentials. No live workers required.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.KITUWA_STORE = "memory";
process.env.KITUWA_OWNER_PIN = "246810";
process.env.KITUWA_SESSION_SECRET = "kituwa-test-session-secret";
process.env.NODE_ENV = "test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL - ${name}`);
    console.error(err instanceof Error ? err.message : err);
  }
}

await check("Integrity Customs project is inferred", async () => {
  const { inferProject, deriveWorkItems } = await import("../lib/kituwa/plan.ts");
  const p = inferProject(
    "Hey Matter, create a project for Integrity Customs. They want help automating email and improving website checkout.",
  );
  assert.equal(p.id, "integrity-customs");
  assert.equal(p.confidence, "high");
  const work = deriveWorkItems(
    "automating email and improving website checkout and why customers aren't converting",
  );
  assert.ok(work.some((w) => w.hat === "AUTOMATION"));
  assert.ok(work.some((w) => w.hat === "BUILD"));
  assert.ok(work.some((w) => w.hat === "ANALYSIS"));
});

await check("PIN and session round-trip; wrong PIN fails", async () => {
  const {
    verifyKituwaPin,
    encodeKituwaSession,
    decodeKituwaSession,
    buildKituwaSession,
  } = await import("../lib/kituwa/auth.ts");
  assert.equal(verifyKituwaPin("246810"), true);
  assert.equal(verifyKituwaPin("000000"), false);
  const token = encodeKituwaSession(buildKituwaSession());
  const session = decodeKituwaSession(token);
  assert.equal(session?.sub, "mason");
  assert.ok(session?.caps.includes("task_create"));
  assert.equal(decodeKituwaSession(token.slice(0, 10) + "tamper"), null);
});

await check("Matter message submit ack + idempotent client_message_id", async () => {
  const { submitMatterMessage } = await import("../lib/matter/submit-message.ts");
  const { loadMatterRecords } = await import("../lib/matter/records-store.ts");
  const clientId = "11111111-1111-4111-8111-111111111111";
  const text =
    "Hey Matter, create a project for Integrity Customs. They want help automating email and improving website checkout.";
  const first = await submitMatterMessage({
    client_message_id: clientId,
    conversation_id: null,
    text,
    attachments: [],
    source: "test",
    client_created_at: new Date().toISOString(),
  });
  assert.match(first.ack.message_id, /^[0-9a-f-]{36}$/i);
  assert.match(first.ack.task_id, /^[0-9a-f-]{36}$/i);
  assert.ok(first.ack.conversation_id);
  assert.ok(["accepted", "blocked", "awaiting_approval"].includes(first.ack.status));
  assert.equal(first.ack.duplicate, undefined);

  const second = await submitMatterMessage({
    client_message_id: clientId,
    conversation_id: first.ack.conversation_id,
    text,
    attachments: [],
    source: "test",
    client_created_at: new Date().toISOString(),
  });
  assert.equal(second.ack.message_id, first.ack.message_id);
  assert.equal(second.ack.task_id, first.ack.task_id);
  assert.equal(second.ack.duplicate, true);

  const store = await loadMatterRecords();
  const task = store.tasks[first.ack.task_id];
  assert.ok(task);
  assert.ok(task.events.some((ev) => ev.kind === "message.received"));
  assert.ok(task.subtask_ids.length >= 2);
  if (task.rejected_workers.length) {
    const subs = task.subtask_ids.map((id) => store.tasks[id]).filter(Boolean);
    assert.ok(subs.some((st) => st.events.some((ev) => ev.kind === "worker.rejected")));
  }
});

await check("Talk persists plan+tasks; no fake RUNNING workers", async () => {
  const { handleTalk, liveStations } = await import("../lib/kituwa/talk.ts");
  const { loadKituwaState } = await import("../lib/kituwa/store.ts");
  const state = await handleTalk({
    text: "Hey Matter, create a project for Integrity Customs. They want help automating email and improving website checkout. Start organizing what we need.",
    source: "voice",
  });
  assert.equal(state.project?.id, "integrity-customs");
  assert.ok(state.requests.length >= 1);
  assert.ok(state.plan.some((s) => s.status === "done" && s.id === "understand"));
  assert.ok(state.tasks.length >= 2);
  assert.equal(state.tasks.some((t) => t.state === "RUNNING"), false);
  const stations = liveStations(state);
  assert.equal(stations.some((s) => s.busy), false);
  const again = await loadKituwaState();
  assert.equal(again.requests[0].id, state.requests[0].id);
  assert.ok(["BLOCKED", "WAITING", "WAITING_FOR_APPROVAL", "ASSIGNED"].includes(state.matterStatus));
  assert.ok(state.messages.some((m) => m.role === "matter" && /Integrity Customs/.test(m.text)));
});

await check("Brain health never fabricates cost", async () => {
  const { kituwaBrainHealth } = await import("../lib/kituwa/health.ts");
  const { loadKituwaState } = await import("../lib/kituwa/store.ts");
  const h = kituwaBrainHealth(await loadKituwaState());
  assert.equal(h.costToday, "UNKNOWN");
  assert.equal(h.apiBudget, "UNKNOWN");
  assert.ok(["ONLINE", "DEGRADED", "OFFLINE", "UNKNOWN"].includes(h.matter));
  assert.ok(h.metrics?.worker_registry?.source);
  assert.ok(h.metrics?.records_storage?.source);
  assert.ok(Array.isArray(h.registryWorkers));
});

await check("No incorrect Kituwa domains in product files", () => {
  const files = [
    "app/kituwa/layout.tsx",
    "app/kituwa/kituwa-app.tsx",
    "middleware.ts",
    "AI-HANDOFF/EVIDENCE/KITUWA_V1_ARCHITECTURE.md",
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    assert.equal(/katua\.app|ketua\.app|matter\.ai|matter\.app/.test(src), false, rel);
    if (rel !== "middleware.ts") {
      assert.ok(src.includes("kituwa.app") || src.includes("KITUWA"), rel);
    }
  }
});

await check("Kituwa API routes are gated", () => {
  const dirs = [path.join(root, "app/api/kituwa"), path.join(root, "app/api/matter")];
  const walk = (d, out = []) => {
    if (!fs.existsSync(d)) return out;
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p, out);
      else if (ent.name === "route.ts") out.push(p);
    }
    return out;
  };
  const routes = dirs.flatMap((d) => walk(d));
  assert.ok(routes.length >= 5);
  for (const p of routes) {
    const src = fs.readFileSync(p, "utf8");
    assert.match(
      src,
      /requireKituwaSession|verifyKituwaPin|verifyKituwaWorkerBearer|requireApiAuth/,
      p,
    );
  }
});

await check("Matter Live hats are task roles, not hard-coded providers", () => {
  const src = fs.readFileSync(path.join(root, "app/kituwa/matter-live.tsx"), "utf8");
  assert.equal(/Cursor badge|always Codex|Claude =/.test(src), false);
  assert.ok(src.includes("assignmentHat") || src.includes("assignmentWorkerId"));
});

await check("Tower floors derive from real task assignment only", async () => {
  const { occupyFloors } = await import("../lib/matter/tower.ts");
  const { loadKituwaState } = await import("../lib/kituwa/store.ts");
  const state = await loadKituwaState();
  const occ = occupyFloors(state.tasks);
  for (const floor of Object.values(occ)) {
    if (floor.busy) {
      assert.ok(floor.tasks.some((t) => t.state === "RUNNING"));
    }
  }
});

if (failed) {
  console.error(`\n${failed} Kituwa checks failed.`);
  process.exit(1);
}
console.log("\nAll KITUWA checks passed.");
