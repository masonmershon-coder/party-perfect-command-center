#!/usr/bin/env node
// Register known workers with PATH-based probes. Does NOT assert online —
// availability is only set by a subsequent real probe.
//
//   node bootstrap-workers.mjs
import { register } from "./matter-registry.mjs";

const workers = [
  {
    worker_id: "claude-code",
    provider: "anthropic",
    product: "claude-code",
    model: null,
    version: null,
    detect: ["claude", "--version"],
    capabilities: {
      coding: { level: 0.9, source: "declared" },
      reasoning: { level: 0.9, source: "declared" },
      local_execution: { level: true, source: "declared" },
      verification: { level: 0.7, source: "declared" },
      research: { level: 0.6, source: "declared" },
      file_ops: { level: true, source: "declared" },
      vision: { level: true, source: "declared" },
    },
    permissions: {
      local_read: true,
      local_write: true,
      production_deploy: false,
      por_write: false,
      money_spend: false,
    },
    cost_class: "subscription",
    limitations: ["Declared capabilities are not measured; routing weight waits for outcomes."],
  },
  {
    worker_id: "cursor-local",
    provider: "cursor",
    product: "cursor-agent",
    model: null,
    version: null,
    detect: ["cursor-agent", "--version"],
    capabilities: {
      coding: { level: 0.85, source: "declared" },
      local_execution: { level: true, source: "declared" },
      file_ops: { level: true, source: "declared" },
      verification: { level: 0.3, source: "declared" },
    },
    permissions: {
      local_read: true,
      local_write: true,
      production_deploy: false,
      por_write: false,
      money_spend: false,
    },
    cost_class: "subscription",
    limitations: ["Command Center implementation lane; declared coding strength only."],
  },
  {
    worker_id: "codex-local",
    provider: "openai",
    product: "codex-cli",
    model: null,
    version: null,
    detect: ["codex", "--version"],
    capabilities: {
      verification: { level: 0.9, source: "declared" },
      coding: { level: 0.8, source: "declared" },
      reasoning: { level: 0.85, source: "declared" },
    },
    permissions: {
      local_read: true,
      local_write: false,
      production_deploy: false,
      por_write: false,
      money_spend: false,
    },
    cost_class: "subscription",
    limitations: ["Prefer as independent verifier; local write disabled by default."],
  },
  {
    worker_id: "grok-local",
    provider: "xai",
    product: "grok-cli",
    model: null,
    version: null,
    detect: ["grok", "--version"],
    capabilities: {
      research: { level: 0.85, source: "declared" },
      reasoning: { level: 0.7, source: "declared" },
      coding: { level: 0.5, source: "declared" },
    },
    permissions: {
      local_read: true,
      local_write: false,
      production_deploy: false,
      por_write: false,
      money_spend: false,
    },
    cost_class: "subscription",
    limitations: ["Research-oriented declared profile; not a production deployer."],
  },
  {
    worker_id: "claw-local",
    provider: "claw",
    product: "claw",
    model: null,
    version: null,
    detect: ["claw", "--version"],
    capabilities: {
      local_execution: { level: true, source: "declared" },
      browser: { level: true, source: "declared" },
    },
    permissions: {
      local_read: true,
      local_write: false,
      production_deploy: false,
      por_write: false,
      money_spend: false,
    },
    cost_class: "unknown",
    limitations: ["Not installed on this host until probe succeeds."],
  },
];

for (const w of workers) {
  const rec = register(w);
  console.log(`registered ${rec.worker_id}  available=${rec.available} (probe separately)`);
}
