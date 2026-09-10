#!/usr/bin/env node
/**
 * Day 1 static contract test for AI Core task idempotency.
 * This deliberately does not connect to production. Runtime proof requires
 * applying the migration in an isolated database and replaying one key.
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync("supabase/migrations/0006_ai_core_task_idempotency.sql", "utf8");
const source = readFileSync("lib/ai-core.ts", "utf8");
const route = readFileSync("app/api/ai-core/tasks/route.ts", "utf8");

assert.match(migration, /add column if not exists idempotency_key/i);
assert.match(migration, /unique index if not exists tasks_domain_idempotency_key_ux/i);
assert.match(migration, /on ai_core\.tasks \(domain, idempotency_key\)/i);
assert.match(source, /idempotencyKey\?: string/);
assert.match(source, /on conflict \(domain, idempotency_key\) where idempotency_key is not null/i);
assert.match(source, /xmax <> 0/);
assert.match(source, /task\.reuse/);
assert.match(source, /task\.create/);

console.log("AI Core idempotency contract: PASS (static; isolated runtime replay still required)");
