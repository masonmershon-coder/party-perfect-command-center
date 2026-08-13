#!/usr/bin/env node
/**
 * Apply ONLY supabase/migrations/0007_mike_remote_intake.sql.
 * HELD until Mason explicitly approves. Never apply 0001/0002 with this.
 *
 * Usage: node --env-file=.env.local scripts/apply-0007-mike-intake.mjs
 */
import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

if (process.env.MIKE_INTAKE_APPLY_0007 !== "YES") {
  console.error("Refusing: set MIKE_INTAKE_APPLY_0007=YES after Mason approval.");
  process.exit(2);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "../supabase/migrations/0007_mike_remote_intake.sql");
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
  console.log("Applying 0007_mike_remote_intake.sql …");
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log("0007 applied OK");
} catch (err) {
  try {
    await client.query("rollback");
  } catch {
    // ignore
  }
  console.error("Apply failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
