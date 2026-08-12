#!/usr/bin/env node
/**
 * Read DATABASE_URL from macOS clipboard (after Supabase Connect → Copy URI),
 * validate transaction pooler shape, probe read-only, update local + Vercel.
 * Never prints the URI or password.
 */
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const REF = "wkwksjitkyhaqgrxasml";

function clip() {
  return execSync("pbpaste", { encoding: "utf8" }).trim();
}

function audit(raw) {
  if (!raw) return { ok: false, reason: "empty" };
  const u = new URL(raw.replace(/^postgresql:/i, "postgres:"));
  const ok =
    u.port === "6543" &&
    u.hostname.includes("pooler.supabase.com") &&
    u.username === `postgres.${REF}`;
  return {
    ok,
    host: u.hostname,
    port: u.port,
    user: u.username,
  };
}

async function probe(uri) {
  const client = new pg.Client({
    connectionString: uri,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
  try {
    await client.connect();
    const por = await client.query(
      `select count(*)::int as n from information_schema.tables where table_schema='por'`,
    );
    const ai = await client.query(
      `select count(*)::int as n from information_schema.tables where table_schema='ai_core'`,
    );
    const porTables = await client.query(
      `select table_name from information_schema.tables where table_schema='por' and table_type='BASE TABLE' order by 1`,
    );
    const aiTables = await client.query(
      `select table_name from information_schema.tables where table_schema='ai_core' and table_type='BASE TABLE' order by 1`,
    );
    const porRls = await client.query(
      `select count(*)::int as n from pg_policies where schemaname='por'`,
    );
    return {
      connection: "ok",
      por: {
        schemaPresent: por.rows[0].n > 0,
        tables: porTables.rows.map((r) => r.table_name),
        policyCount: porRls.rows[0].n,
      },
      aiCore: {
        schemaPresent: ai.rows[0].n > 0,
        tables: aiTables.rows.map((r) => r.table_name),
        needsMigration0003: ai.rows[0].n === 0,
      },
    };
  } catch (err) {
    return {
      connection: "fail",
      connectionError: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await client.end().catch(() => {});
  }
}

function writeLocal(uri) {
  const envPath = join(process.cwd(), ".env.local");
  let body = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const line = `DATABASE_URL="${uri.replace(/"/g, '\\"')}"`;
  if (/^DATABASE_URL=/m.test(body)) body = body.replace(/^DATABASE_URL=.*$/m, line);
  else body = `${body.trimEnd()}\n${line}\n`;
  writeFileSync(envPath, body, { mode: 0o600 });
}

function updateVercel(uri) {
  const tmp = join(process.cwd(), ".tmp-database-url");
  writeFileSync(tmp, uri, { mode: 0o600 });
  try {
    for (const env of ["production", "preview"]) {
      spawnSync(
        "npx",
        ["vercel", "env", "update", "DATABASE_URL", env, "--value", uri, "--yes", "--sensitive"],
        { cwd: process.cwd(), stdio: "ignore", env: process.env },
      );
    }
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

const uri = clip();
const a = audit(uri);
if (!a.ok) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        message:
          "Clipboard is not a valid transaction pooler URI. In Supabase Connect → Transaction pooler → URI → Copy, then rerun.",
        audit: a,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const result = await probe(uri);
if (result.connection !== "ok") {
  console.log(JSON.stringify({ ok: false, audit: a, probe: result }, null, 2));
  process.exit(1);
}

writeLocal(uri);
updateVercel(uri);
console.log(
  JSON.stringify(
    {
      ok: true,
      audit: a,
      localDatabaseUrl: "SET",
      vercelDatabaseUrl: "SET (production + preview)",
      probe: result,
    },
    null,
    2,
  ),
);
