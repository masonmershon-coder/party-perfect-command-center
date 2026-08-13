#!/usr/bin/env node
// POR WRITE GATEWAY — Stage A: CONTRACT + VALIDATION ONLY.
//
//   node gateway.mjs --dry-run '<json CreateTestQuote>'
//   node gateway.mjs --schema
//
// THERE IS NO ADAPTER. This component cannot write to POR — not "is configured
// not to", but has no code path that could. The adapter interface is declared
// and deliberately unimplemented, so the mechanism (vendor API / stored
// procedure / Counter automation) can be chosen on evidence later without
// touching any of the safety work below.
//
// SEPARATION: this file shares nothing with por-sync-agent. No connection
// string, no credential, no import. The reader stays ApplicationIntent=ReadOnly
// with its SELECT-only guards, untouched.
import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUDIT = path.join(HERE, "WRITE_AUDIT.jsonl");
const now = () => new Date().toISOString();

// ---------------------------------------------------------------- adapter
/**
 * The ONLY place a real write could ever happen. Unimplemented on purpose.
 * Chosen on evidence once the routine census resolves whether a supported
 * stored procedure exists, or the vendor answers.
 */
const ADAPTER = {
  id: "none",
  available: false,
  reason: "No supported POR write mechanism has been identified. Import covers Tax/Customer/Vendor only; SFSync is unconfigured; IntegrationResources is outbound; stored procedures were never captured; vendor API unanswered.",
  commit: async () => {
    throw new Error("REFUSED: no write adapter exists. Stage A is dry-run only.");
  },
};

// ---------------------------------------------------------------- policy
const ALLOWED_COMMAND = "CreateTestQuote";
const ALLOWED_STATUS = "Q";                       // Quote only — never R/O/C
const TEST_MARKER = /AI TEST/i;                   // must appear in the customer name
const FORBIDDEN_FIELDS = [
  "payment", "deposit", "paid", "refund", "credit", "tender",
  "sql", "query", "statement", "connectionString", "password", "user",
  "delete", "update", "convert", "reservation", "order",
];

/** Schema. Anything not declared here is rejected — allowlist, not blocklist. */
export const REQUEST_SCHEMA = {
  command:        { required: true,  type: "string", equals: ALLOWED_COMMAND },
  idempotency_key:{ required: true,  type: "string", min: 8 },
  actor:          { required: true,  type: "string" },
  approval_ref:   { required: false, type: "string" },   // required only to COMMIT
  test_customer_key: { required: true, type: "string" },
  test_customer_name:{ required: true, type: "string", match: TEST_MARKER },
  status:         { required: true,  type: "string", equals: ALLOWED_STATUS },
  event_date:     { required: true,  type: "date" },
  delivery_datetime: { required: false, type: "date" },
  pickup_datetime:   { required: false, type: "date" },
  fulfillment:    { required: true,  type: "enum", values: ["delivery", "customer_pickup"] },
  delivery_address: { required: false, type: "string" },
  items:          { required: true,  type: "items", min: 1 },
  rate_source:    { required: true,  type: "enum", values: ["por_rate1"] },  // never an invented rate
  tax_treatment:  { required: true,  type: "enum", values: ["customer_taxcode"] },
  waiver_treatment:{ required: true, type: "enum", values: ["rent_only_5pct", "declined"] },
  notes:          { required: false, type: "notes" },
  salesman:       { required: false, type: "string" },
  job_site:       { required: false, type: "string" },
};

// ---------------------------------------------------------------- validate
export function validate(req, catalog = null) {
  const errors = [];
  const warnings = [];

  if (!req || typeof req !== "object") return { ok: false, errors: ["request must be an object"], warnings };

  // Allowlist: reject anything undeclared.
  for (const k of Object.keys(req)) {
    if (!(k in REQUEST_SCHEMA)) errors.push(`unknown field '${k}' — allowlist only`);
    if (FORBIDDEN_FIELDS.some((f) => k.toLowerCase().includes(f)))
      errors.push(`forbidden field '${k}' — payments, mutations and raw SQL are not accepted`);
  }

  for (const [k, rule] of Object.entries(REQUEST_SCHEMA)) {
    const v = req[k];
    if (v == null || v === "") {
      if (rule.required) errors.push(`${k} is required`);
      continue;
    }
    if (rule.equals && v !== rule.equals) errors.push(`${k} must be '${rule.equals}' (got '${v}')`);
    if (rule.values && !rule.values.includes(v)) errors.push(`${k} must be one of ${rule.values.join("|")} (got '${v}')`);
    if (rule.match && !rule.match.test(String(v))) errors.push(`${k} must carry the AI TEST marker`);
    if (rule.min && typeof v === "string" && v.length < rule.min) errors.push(`${k} too short`);
    if (rule.type === "date" && Number.isNaN(Date.parse(v))) errors.push(`${k} is not a valid date`);
  }

  // Items: SKU must exist in the POR catalog; quantity sane; NO client-supplied rate.
  if (Array.isArray(req.items)) {
    if (!req.items.length) errors.push("items must not be empty");
    req.items.forEach((it, i) => {
      if (!it || typeof it !== "object") return errors.push(`items[${i}] malformed`);
      if (!it.sku) errors.push(`items[${i}].sku required`);
      if (!Number.isInteger(it.qty) || it.qty <= 0) errors.push(`items[${i}].qty must be a positive integer`);
      if ("rate" in it || "price" in it || "pric" in it)
        errors.push(`items[${i}] must not supply a rate — rates come from POR (rate_source)`);
      if (catalog && it.sku && !catalog.has(String(it.sku))) errors.push(`items[${i}].sku '${it.sku}' not found in POR catalog`);
    });
  } else if (req.items != null) errors.push("items must be an array");

  // Notes must be structured — POR has SEVEN distinct destinations, never one box.
  if (req.notes != null) {
    if (typeof req.notes !== "object" || Array.isArray(req.notes)) errors.push("notes must be an object keyed by POR destination");
    else {
      const ALLOWED = ["transaction", "delivery", "pickup"];
      for (const k of Object.keys(req.notes))
        if (!ALLOWED.includes(k)) errors.push(`notes.${k} is not a POR note destination (${ALLOWED.join("|")})`);
    }
  }

  if (req.fulfillment === "delivery" && !req.delivery_address)
    warnings.push("delivery selected without an address");

  return { ok: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------- idempotency
export function seenKey(key) {
  if (!existsSync(AUDIT)) return false;
  return readFileSync(AUDIT, "utf8").split("\n").filter(Boolean).some((l) => {
    try { return JSON.parse(l).idempotency_key === key; } catch { return false; }
  });
}

function audit(entry) {
  mkdirSync(path.dirname(AUDIT), { recursive: true });
  const safe = { ...entry };
  // Credentials must never reach the audit log, even if a caller sends them.
  for (const k of Object.keys(safe)) if (/password|secret|token|connection/i.test(k)) delete safe[k];
  appendFileSync(AUDIT, JSON.stringify({ at: now(), ...safe }) + "\n");
}

// ---------------------------------------------------------------- execute
export async function execute(req, { commit = false, catalog = null } = {}) {
  const audit_id = createHash("sha1").update(`${req?.idempotency_key}|${now()}`).digest("hex").slice(0, 12);

  const v = validate(req, catalog);
  if (!v.ok) {
    audit({ audit_id, idempotency_key: req?.idempotency_key, actor: req?.actor, state: "REJECTED", errors: v.errors });
    return { state: "REJECTED", audit_id, validation: v, por_transaction_number: null, print_status: "not_attempted" };
  }

  // Retry safety: a repeated key never produces a second quote.
  if (seenKey(req.idempotency_key)) {
    audit({ audit_id, idempotency_key: req.idempotency_key, actor: req.actor, state: "DUPLICATE_SUPPRESSED" });
    return { state: "DUPLICATE_SUPPRESSED", audit_id, validation: v, por_transaction_number: null, print_status: "not_attempted",
      reason: "idempotency key already used — refusing to create a second quote" };
  }

  if (!commit) {
    audit({ audit_id, idempotency_key: req.idempotency_key, actor: req.actor, state: "DRY_RUN", items: req.items.length });
    return {
      state: "DRY_RUN", audit_id, validation: v,
      por_transaction_number: null,          // never fabricated — only POR may assign one
      totals: { note: "computed only when a rate source is bound to live POR data" },
      print_status: "not_attempted",
      adapter: { id: ADAPTER.id, available: ADAPTER.available, reason: ADAPTER.reason },
    };
  }

  // COMMIT path — fails closed, twice.
  if (!req.approval_ref) {
    audit({ audit_id, idempotency_key: req.idempotency_key, state: "REFUSED_NO_APPROVAL" });
    return { state: "REFUSED", audit_id, reason: "commit requires an explicit approval_ref", por_transaction_number: null };
  }
  audit({ audit_id, idempotency_key: req.idempotency_key, actor: req.actor, state: "COMMIT_ATTEMPTED", approval_ref: req.approval_ref });
  try {
    await ADAPTER.commit(req);
  } catch (e) {
    audit({ audit_id, idempotency_key: req.idempotency_key, state: "REFUSED_NO_ADAPTER", reason: e.message });
    return { state: "REFUSED", audit_id, reason: e.message, por_transaction_number: null, print_status: "not_attempted" };
  }
}

// ---------------------------------------------------------------- cli
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes("--schema")) { console.log(JSON.stringify(REQUEST_SCHEMA, null, 2)); process.exit(0); }
  const i = argv.indexOf("--dry-run");
  if (i >= 0) {
    const r = await execute(JSON.parse(argv[i + 1] || "{}"), { commit: false });
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.state === "DRY_RUN" ? 0 : 1);
  }
  console.log("usage: --schema | --dry-run '<json>'");
}
