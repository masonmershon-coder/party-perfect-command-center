#!/usr/bin/env node
// Stage A validation tests. Synthetic only. No POR contact of any kind.
import { validate, execute } from "./gateway.mjs";
import { rmSync } from "node:fs";
rmSync(new URL("./WRITE_AUDIT.jsonl", import.meta.url), { force: true });

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (console.log(`  PASS  ${n}`), pass++) : (console.log(`  FAIL  ${n} ${x}`), fail++); };
const CATALOG = new Set(["212894", "218654"]);

const good = () => ({
  command: "CreateTestQuote", idempotency_key: "idem-aiparty-0001", actor: "claude",
  test_customer_key: "AITEST001", test_customer_name: "AI TEST — DO NOT BOOK",
  status: "Q", event_date: "2026-09-19", fulfillment: "customer_pickup",
  items: [{ sku: "212894", qty: 10 }],
  rate_source: "por_rate1", tax_treatment: "customer_taxcode", waiver_treatment: "rent_only_5pct",
  notes: { transaction: "AI party", delivery: "", pickup: "" },
});
const bad = (o) => validate({ ...good(), ...o }, CATALOG);

console.log("POR WRITE GATEWAY — Stage A validation\n");
ok("valid request passes", validate(good(), CATALOG).ok);
ok("unknown SKU rejected", !bad({ items: [{ sku: "NOPE", qty: 1 }] }).ok);
ok("zero quantity rejected", !bad({ items: [{ sku: "212894", qty: 0 }] }).ok);
ok("negative quantity rejected", !bad({ items: [{ sku: "212894", qty: -5 }] }).ok);
ok("client-supplied rate rejected", !bad({ items: [{ sku: "212894", qty: 1, rate: 4 }] }).ok);
ok("malformed date rejected", !bad({ event_date: "not-a-date" }).ok);
ok("unknown tax handling rejected", !bad({ tax_treatment: "guess" }).ok);
ok("unknown waiver handling rejected", !bad({ waiver_treatment: "made_up" }).ok);
ok("non-TEST customer rejected", !bad({ test_customer_name: "Real Customer LLC" }).ok);
ok("status other than Quote rejected", !bad({ status: "R" }).ok);
ok("payment field rejected", !bad({ deposit: 500 }).ok);
ok("delete operation rejected", !bad({ delete: true }).ok);
ok("raw SQL rejected", !bad({ sql: "INSERT INTO Transactions" }).ok);
ok("client credentials rejected", !bad({ password: "x", connectionString: "y" }).ok);
ok("merged notes box rejected", !bad({ notes: { everything: "one box" } }).ok);
ok("unknown field rejected (allowlist)", !bad({ surprise: 1 }).ok);

const r1 = await execute(good(), { commit: false, catalog: CATALOG });
ok("dry-run returns DRY_RUN", r1.state === "DRY_RUN", `(got ${r1.state})`);
ok("dry-run NEVER fabricates a POR number", r1.por_transaction_number === null);
ok("dry-run reports no adapter available", r1.adapter?.available === false);

const r2 = await execute(good(), { commit: false, catalog: CATALOG });
ok("reused idempotency key suppressed", r2.state === "DUPLICATE_SUPPRESSED", `(got ${r2.state})`);

const r3 = await execute({ ...good(), idempotency_key: "idem-noapproval-1" }, { commit: true, catalog: CATALOG });
ok("commit without approval_ref refused", r3.state === "REFUSED", `(got ${r3.state})`);

const r4 = await execute({ ...good(), idempotency_key: "idem-approved-1", approval_ref: "mason-2026-08-13" }, { commit: true, catalog: CATALOG });
ok("commit WITH approval still refused (no adapter exists)", r4.state === "REFUSED", `(got ${r4.state})`);
ok("refusal names the missing adapter", /adapter/i.test(r4.reason || ""));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
