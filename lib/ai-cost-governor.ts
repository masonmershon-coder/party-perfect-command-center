/**
 * Pass-through of the existing compute governor dashboard payload.
 * Do not recompute those money strings here.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function loadGovernorPayload(root = process.cwd()): unknown | null {
  try {
    const ledger = path.join(root, "AI-HANDOFF", "COMPUTE_LEDGER.jsonl");
    if (!existsSync(ledger)) return null;
    const lines = readFileSync(ledger, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return {
      source: "AI-HANDOFF/COMPUTE_LEDGER.jsonl",
      schema_note: "Pass-through only. Render money strings verbatim. UNKNOWN is not $0.",
      row_count: lines.length,
      last_row: lines.length ? JSON.parse(lines[lines.length - 1]) : null,
    };
  } catch {
    return null;
  }
}
