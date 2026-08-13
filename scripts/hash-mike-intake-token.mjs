#!/usr/bin/env node
/**
 * Provisioning helper: SHA-256 a Talk-to-Mike device/worker token for Vercel env.
 *
 * Usage:
 *   printf '%s' "$TOKEN" | node scripts/hash-mike-intake-token.mjs
 *
 * Prints hex only. Does not write files. Never commit the token.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const input = readFileSync(0, "utf8").trim();
if (!input || input.length < 32) {
  console.error("Provide a high-entropy token (>=32 chars) on stdin.");
  process.exit(2);
}
process.stdout.write(createHash("sha256").update(input, "utf8").digest("hex") + "\n");
