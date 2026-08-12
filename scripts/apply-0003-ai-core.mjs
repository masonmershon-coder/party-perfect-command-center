#!/usr/bin/env node
/**
 * Apply ONLY supabase/migrations/0003_ai_core.sql (never 0002).
 * Requires valid DATABASE_URL (transaction pooler).
 *
 * Usage: node --env-file=.env.local scripts/apply-0003-ai-core.mjs
 */
import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "../supabase/migrations/0003_ai_core.sql");

const url = process.env.DATABASE_URL?.trim();
if (!url || url.includes("[") || !/^postgres(ql)?:\/\//i.test(url)) {
  console.error("DATABASE_URL must be a real postgresql:// URI");
  process.exit(2);
}

const sql = fs.readFileSync(sqlPath, "utf8");
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("Applying 0003_ai_core.sql …");
  await client.query(sql);
  const { rows } = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'ai_core' order by table_name`,
  );
  console.log("ai_core tables:", rows.map((r) => r.table_name).join(", "));
  console.log("0003 applied OK");
} catch (err) {
  console.error("Apply failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
