#!/usr/bin/env node
/**
 * Repair misconfigured Supabase DATABASE_URL (direct host @ :6543) → transaction pooler.
 * Never prints secrets. Use with: vercel env run -e production -- node scripts/repair-pooler-uri.mjs [--probe|--emit-fixed]
 *
 * Party Perfect App ref: wkwksjitkyhaqgrxasml (us-west-2)
 */
import { createHash } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const REF = "wkwksjitkyhaqgrxasml";
const POOLER_HOST = "aws-0-us-west-2.pooler.supabase.com";
const POOLER_PORT = "6543";

function auditUri(raw) {
  if (!raw?.trim()) return { ok: false, reason: "missing" };
  try {
    const u = new URL(raw.trim().replace(/^postgresql:/i, "postgres:"));
    const host = u.hostname || "";
    const port = u.port || "5432";
    const user = decodeURIComponent(u.username || "");
    const tx =
      port === "6543" &&
      user === `postgres.${REF}` &&
      host.includes("pooler.supabase.com");
    const misdirect =
      host === `db.${REF}.supabase.co` ||
      (port === "6543" && user === "postgres" && host.includes("supabase.co"));
    return { ok: tx, misdirect, host, port, user: user.split("@")[0], tx };
  } catch {
    return { ok: false, reason: "parse_error" };
  }
}

function repairUri(raw) {
  const trimmed = raw.trim();
  const u = new URL(trimmed.replace(/^postgresql:/i, "postgres:"));
  u.hostname = POOLER_HOST;
  u.port = POOLER_PORT;
  u.username = `postgres.${REF}`;
  return u.toString().replace(/^postgres:/i, "postgresql:");
}

const EXPECTED_POR = [
  "customers",
  "contracts",
  "contract_items",
  "payments",
  "items",
  "salesmen",
  "sync_meta",
];
const EXPECTED_AI = [
  "projects",
  "tasks",
  "meetings",
  "artifacts",
  "approvals",
  "brain_records",
  "audit_log",
];

async function probe(uri) {
  const client = new pg.Client({
    connectionString: uri,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
  const out = {
    connection: "fail",
    connectionError: null,
    por: { schemaPresent: false, tables: [], missingTables: EXPECTED_POR, policyCount: 0, rlsEnabledTables: [] },
    aiCore: { schemaPresent: false, tables: [], missingTables: EXPECTED_AI, needsMigration0003: true, rlsEnabledTables: [] },
  };
  try {
    await client.connect();
    out.connection = "ok";

    const porSchema = await client.query(
      `select schema_name from information_schema.schemata where schema_name = 'por'`,
    );
    out.por.schemaPresent = porSchema.rows.length > 0;
    if (out.por.schemaPresent) {
      const tables = await client.query(
        `select table_name from information_schema.tables where table_schema='por' and table_type='BASE TABLE' order by table_name`,
      );
      out.por.tables = tables.rows.map((r) => r.table_name);
      out.por.missingTables = EXPECTED_POR.filter((t) => !out.por.tables.includes(t));
      const pol = await client.query(`select count(*)::int as n from pg_policies where schemaname='por'`);
      out.por.policyCount = pol.rows[0]?.n ?? 0;
      const rls = await client.query(
        `select c.relname as table_name, c.relrowsecurity as rls_enabled from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname='por' and c.relkind='r'`,
      );
      out.por.rlsEnabledTables = rls.rows.filter((r) => r.rls_enabled).map((r) => r.table_name);
      if (out.por.tables.includes("customers")) {
        const counts = await client.query(
          `select
            (select count(*)::bigint from por.customers) as customers,
            (select count(*)::bigint from por.contracts) as contracts,
            (select count(*)::bigint from por.items) as items`,
        );
        out.por.rowCounts = counts.rows[0];
      }
    }

    const aiSchema = await client.query(
      `select schema_name from information_schema.schemata where schema_name = 'ai_core'`,
    );
    out.aiCore.schemaPresent = aiSchema.rows.length > 0;
    if (out.aiCore.schemaPresent) {
      const tables = await client.query(
        `select table_name from information_schema.tables where table_schema='ai_core' and table_type='BASE TABLE' order by table_name`,
      );
      out.aiCore.tables = tables.rows.map((r) => r.table_name);
      out.aiCore.missingTables = EXPECTED_AI.filter((t) => !out.aiCore.tables.includes(t));
      out.aiCore.needsMigration0003 = out.aiCore.missingTables.length > 0;
      const rls = await client.query(
        `select c.relname as table_name, c.relrowsecurity as rls_enabled from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname='ai_core' and c.relkind='r'`,
      );
      out.aiCore.rlsEnabledTables = rls.rows.filter((r) => r.rls_enabled).map((r) => r.table_name);
    }
  } catch (err) {
    out.connectionError = err instanceof Error ? err.message : String(err);
  } finally {
    await client.end().catch(() => {});
  }
  return out;
}

const mode = process.argv[2] || "--probe";
const raw = process.env.DATABASE_URL || "";
const before = auditUri(raw);

if (mode === "--emit-fixed") {
  if (!raw.trim()) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }
  const fixed = before.ok ? raw.trim() : repairUri(raw);
  process.stdout.write(fixed);
  process.exit(0);
}

let uri = raw.trim();
if (!before.ok && before.misdirect) {
  uri = repairUri(raw);
}

const after = auditUri(uri);
const result = await probe(uri);

const report = {
  mode,
  before: { ok: before.ok, misdirect: before.misdirect, host: before.host, port: before.port, user: before.user },
  after: { ok: after.ok, host: after.host, port: after.port, user: after.user },
  poolerHost: POOLER_HOST,
  connection: result.connection,
  connectionError: result.connectionError,
  por: result.por,
  aiCore: result.aiCore,
  uriFingerprint: uri ? createHash("sha256").update(uri).digest("hex").slice(0, 12) : null,
};

console.log(JSON.stringify(report, null, 2));

if (mode === "--write-local" && result.connection === "ok") {
  const envPath = join(process.cwd(), ".env.local");
  let body = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const line = `DATABASE_URL="${uri.replace(/"/g, '\\"')}"`;
  if (/^DATABASE_URL=/m.test(body)) {
    body = body.replace(/^DATABASE_URL=.*$/m, line);
  } else {
    body = body.trimEnd() + (body.endsWith("\n") || !body ? "" : "\n") + line + "\n";
  }
  writeFileSync(envPath, body, { mode: 0o600 });
  console.log(JSON.stringify({ localEnv: "updated", path: ".env.local" }));
}

process.exitCode = result.connection === "ok" ? 0 : 1;
