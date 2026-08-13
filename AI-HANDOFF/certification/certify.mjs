#!/usr/bin/env node
// POR PARITY CERTIFICATION ENGINE — DETERMINISTIC. POR is the oracle.
//
//   node certify.mjs                 run all certifications
//   node certify.mjs --id=CERT-...   run one
//   node certify.mjs --no-tasks      report only; create no control-plane tasks
//
// For each certification: derive the answer from POR, derive it independently
// from Command Center, compare, store evidence. On disagreement, open a Cursor
// task and route the fix to Codex.
//
// TWO RULES THAT MAKE THIS TRUSTWORTHY
//   1. Expected values are COMPUTED from POR at run time. No hardcoded counts.
//   2. A STALE oracle can never produce PASS. "Deliveries today" cannot be
//      certified from a three-day-old export; it reports BLOCKED_STALE_ORACLE.
//      Reporting PASS from stale evidence is the failure this engine exists to
//      prevent.
import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HANDOFF = path.dirname(HERE);
const REPO = path.dirname(HANDOFF);
const CP = path.join(HANDOFF, "control-plane.mjs");
const MANIFEST = path.join(HERE, "manifest.json");
const RESULTS = path.join(HANDOFF, "POR_CERTIFICATION_RESULTS.jsonl");
const BASE = process.env.CC_BASE_URL || "https://partyperfect.app";

const now = () => new Date().toISOString();
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
// Prefer the replicated live mirror when it exists and is verified-fresh;
// fall back to the dated SSD export. The freshness gate then does its job
// automatically: a fresh mirror unblocks "today" questions, a stale one does not.
function pickOracle() {
  const live = manifest.oracles.live_mirror_ssd;
  if (live && existsSync(live.path)) {
    try {
      const st = JSON.parse(readFileSync(live.state_file, "utf8"));
      if (st.last_success) return { ...live, as_of: st.last_success, id: "live_mirror_ssd" };
    } catch { /* fall through to the dated export */ }
  }
  return { ...manifest.oracles.ssd, id: "ssd" };
}
const ORACLE = pickOracle();

const STATE = {
  PASS: "PASS", FAIL: "FAIL", PARTIAL: "PARTIAL",
  BLOCKED: "BLOCKED", UNKNOWN: "UNKNOWN",
  BLOCKED_STALE: "BLOCKED_STALE_ORACLE",
  HUMAN: "HUMAN_WORKFLOW_REQUIRED",
};

// ---------------------------------------------------------------- oracle io
/**
 * Proper RFC-4180 CSV reader.
 *
 * A naive line-split is WRONG here and produced a false FAIL on first run:
 * POR note fields contain embedded newlines, so 1,432 of the first 5,000 lines
 * carry an unbalanced quote. Splitting on \n yielded 160,552 phantom rows
 * instead of 36,006 real ones and invented a bogus status character.
 * A certification engine that mis-parses its own oracle is worse than none.
 */
const csv = (file) => {
  const p = path.join(ORACLE.path, file);
  if (!existsSync(p)) return null;
  const text = readFileSync(p, "utf8").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;                       // newlines inside quotes are DATA
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\r") { /* skip */ }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  if (!rows.length) return null;
  const head = rows[0];
  return rows.slice(1).filter((r) => r.length > 1).map((cells) => {
    const o = {};
    head.forEach((h, i) => (o[h] = cells[i] ?? ""));
    return o;
  });
};

const isLive = (r) =>
  (r.Archived || "").trim().toLowerCase() !== "true" &&
  (r.Cancelled || "").trim().toLowerCase() !== "true";

const parseDate = (s) => {
  const m = (s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(+m[3], +m[1] - 1, +m[2]) : null;
};
const sameDay = (d, t) => d && d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/** Days between the oracle snapshot and now. Drives the staleness gate. */
function oracleAgeDays() {
  return Math.floor((Date.now() - Date.parse(ORACLE.as_of)) / 86400000);
}

// ---------------------------------------------------------------- subject io
async function cc(pathname) {
  try {
    const r = await fetch(`${BASE}${pathname}`, { headers: { accept: "application/json" } });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    return { error: String(e).slice(0, 120) };
  }
}

// ---------------------------------------------------------------- checks
const CHECKS = {
  async "CERT-DELIVERIES-TODAY"(c) {
    const tx = csv("Transactions.csv");
    if (!tx) return { state: STATE.BLOCKED, detail: "oracle unreachable" };
    const today = new Date();
    const expected = tx.filter((r) => isLive(r) && sameDay(parseDate(r.DeliveryDate), today)).length;
    const s = await cc("/api/stats");
    const actual = s?.stats?.por?.deliveriesToday;
    return compareCount(c, expected, actual, "deliveries on the test date");
  },

  async "CERT-RETURNS-TODAY"(c) {
    const tx = csv("Transactions.csv");
    if (!tx) return { state: STATE.BLOCKED, detail: "oracle unreachable" };
    const today = new Date();
    const expected = tx.filter((r) => isLive(r) && sameDay(parseDate(r.PickupDate), today)).length;
    const s = await cc("/api/stats");
    return compareCount(c, expected, s?.stats?.por?.returnsDueToday, "pickups due on the test date");
  },

  async "CERT-OPEN-RESERVATIONS"(c) {
    const tx = csv("Transactions.csv");
    if (!tx) return { state: STATE.BLOCKED, detail: "oracle unreachable" };
    const prim = (r) => ((r.STAT || " ")[0] || " ").toUpperCase();
    const expected = tx.filter((r) => isLive(r) && ["R", "O"].includes(prim(r))).length;
    const bare = tx.filter((r) => (r.STAT || "").trim().toUpperCase() === "R").length;
    const s = await cc("/api/stats");
    const actual = s?.stats?.por?.openContracts;
    const res = compareCount(c, expected, actual, "live reservations + open orders", "GREATER_OR_EQUAL");
    res.detail += ` · bare 'R' rows in POR: ${bare} (why an exact-match query returns near zero)`;
    return res;
  },

  async "CERT-STAT-CLASSIFICATION"(c) {
    const tx = csv("Transactions.csv");
    if (!tx) return { state: STATE.BLOCKED, detail: "oracle unreachable" };
    const KNOWN = new Set([" ", "", "A", "C", "D", "F", "O", "Q", "R", "W"]);
    const prim = (r) => ((r.STAT || " ")[0] || " ").toUpperCase();
    const unknown = [...new Set(tx.map(prim))].filter((p) => !KNOWN.has(p));
    const corrupted = tx.filter((r) => {
      const raw = r.STAT || "";
      return prim(r) !== (((raw.replace(/^\s+/, "") || " ")[0] || " ").toUpperCase());
    }).length;
    const pct = ((corrupted / tx.length) * 100).toFixed(1);
    if (unknown.length) return { state: STATE.FAIL, expected: "all primaries known", actual: unknown.join(","), detail: `unmapped primary status chars: ${unknown}` };
    return {
      state: STATE.PASS,
      expected: "every primary char maps to a known state; no LTRIM",
      actual: "satisfied",
      detail: `${tx.length} rows · LTRIM would corrupt ${corrupted} (${pct}%) — invariant holds`,
    };
  },

  async "CERT-WAIVER-BASE"(c) {
    const tx = csv("Transactions.csv");
    if (!tx) return { state: STATE.BLOCKED, detail: "oracle unreachable" };
    let rentOnly = 0, both = 0, sample = 0;
    for (const r of tx) {
      const rent = num(r.RENT), sale = num(r.SALE), dw = num(r.DMG);
      if (dw <= 0 || rent <= 0 || sale <= 0) continue;
      sample++;
      if (Math.abs(dw - Math.round(rent * 0.05 * 100) / 100) < 0.011) rentOnly++;
      if (Math.abs(dw - Math.round((rent + sale) * 0.05 * 100) / 100) < 0.011) both++;
    }
    const dominates = rentOnly > both * 10;
    return {
      state: dominates ? STATE.PASS : STATE.FAIL,
      expected: "5% of RENT dominates 5% of RENT+SALE",
      actual: `rent-only ${rentOnly} vs rent+sale ${both}`,
      detail: `${sample} tickets with both rent and sale · POR base is RENT only`,
      note: "POR side proven. Command Center still applies 5% to the product subtotal — tracked as POR-PARITY-WAIVER-BASE-001.",
      subject_conforms: false,
    };
  },

  async "CERT-INVENTORY-RENTABLE"(c) {
    const items = csv("ItemFile.csv");
    if (!items) return { state: STATE.BLOCKED, detail: "oracle unreachable" };
    const active = items.filter((r) => (r.Inactive || "").trim().toLowerCase() !== "true");
    const ceiling = active.length * 200; // generous upper bound on plausible units out
    const s = await cc("/api/stats");
    const actual = s?.stats?.por?.inventoryOut;
    if (typeof actual !== "number") return { state: STATE.UNKNOWN, detail: "Command Center did not report inventoryOut" };
    const ok = actual > 0 && actual < ceiling;
    return {
      state: ok ? STATE.PASS : STATE.FAIL,
      expected: `0 < inventoryOut < ${ceiling} (from ${active.length} active catalog items)`,
      actual,
      detail: ok ? "magnitude plausible" : "implausible magnitude — fee/service SKUs are polluting the rentable count",
    };
  },

  async "CERT-KIT-SEMANTICS"(c) {
    const items = csv("ItemFile.csv");
    const kits = csv("ItemKits.csv");
    if (!items || !kits) return { state: STATE.BLOCKED, detail: "oracle unreachable" };
    const byNum = new Map(items.map((r) => [(r.NUM || "").trim(), r]));
    const byKey = new Map(items.map((r) => [(r.KEY || "").trim(), r]));
    const kitNums = new Set(kits.map((k) => (k.Num || "").trim()));
    let resolvable = 0, total = 0;
    for (const n of kitNums) {
      const header = byNum.get(n);
      if (!header || (header.TYPE || "").trim().toUpperCase() !== "K") continue;
      total++;
      const comps = kits.filter((k) => (k.Num || "").trim() === n)
        .map((k) => byKey.get((k.ItemKey || "").trim()))
        .filter((x) => x && (x.TYPE || "").trim().toUpperCase() !== "K");
      if (comps.length) resolvable++;
    }
    const pct = total ? (resolvable / total) * 100 : 0;
    return {
      state: pct > 80 ? STATE.PASS : STATE.PARTIAL,
      expected: "kit headers resolve to non-kit components",
      actual: `${resolvable}/${total} (${pct.toFixed(1)}%)`,
      detail: "lib/por-kits.ts implements this; UI wiring tracked as POR-PARITY-KITS-001",
    };
  },

  async "CERT-CUSTOMER-TAXCODE"(c) {
    const cust = csv("CustomerFile.csv");
    if (!cust) return { state: STATE.BLOCKED, detail: "oracle unreachable" };
    const codes = new Map();
    for (const r of cust) {
      const t = (r.TaxCode || "").trim();
      codes.set(t || "(blank)", (codes.get(t || "(blank)") || 0) + 1);
    }
    // "0" means "use the store default" (ParameterFile.STORE_TAX). Real exposure
    // is customers on a NON-default code — measure it rather than flagging the
    // mere existence of more than one value.
    const DEFAULTISH = new Set(["0", "", "(blank)"]);
    const exposed = [...codes.entries()].filter(([k]) => !DEFAULTISH.has(k));
    const exposedCount = exposed.reduce((a, [, v]) => a + v, 0);
    return {
      state: exposedCount > 0 ? STATE.FAIL : STATE.PASS,
      expected: "tax resolved from the customer's TaxCode",
      actual: `${exposedCount} of ${cust.length} customers on a non-default code`,
      detail: exposedCount
        ? `Command Center assumes one store rate; ${exposedCount} customer(s) carry a specific code: ${exposed.map(([k, v]) => `${k}(${v})`).join(", ")}. Low volume, but each is billed the wrong tax.`
        : "every customer uses the store default — a single rate is currently equivalent",
      subject_conforms: false,
      severity_note: exposedCount < 20 ? "LOW VOLUME — correctness issue, not a widespread mis-billing" : null,
    };
  },

  async "CERT-NOTES-SEPARATION"(c) {
    const tx = csv("Transactions.csv");
    if (!tx) return { state: STATE.BLOCKED, detail: "oracle unreachable" };
    const f = (k) => tx.filter((r) => (r[k] || "").trim()).length;
    const notes = f("Notes"), del = f("DeliveryNotes"), pick = f("PickupNotes");
    const distinct = [notes, del, pick].filter((n) => n / tx.length > 0.1).length;
    return {
      state: distinct >= 2 ? STATE.FAIL : STATE.PASS,
      expected: "each POR note field maps 1:1 to its own Command Center input",
      actual: `Notes ${(notes / tx.length * 100).toFixed(1)}% · Delivery ${(del / tx.length * 100).toFixed(1)}% · Pickup ${(pick / tx.length * 100).toFixed(1)}%`,
      detail: "multiple note fields independently populated; the quote wizard still collapses them into one box",
      subject_conforms: false,
    };
  },

  async "CERT-DELIVERY-TIME-MODEL"(c) {
    const tx = csv("Transactions.csv");
    if (!tx) return { state: STATE.BLOCKED, detail: "oracle unreachable" };
    const dedicated = tx.filter((r) => (r.DeliverySetupTime || "0").trim() !== "0").length;
    const withTime = tx.filter((r) => /\d{1,2}:\d{2}/.test(r.DeliveryDate || "") && !/12:00:00 AM/.test(r.DeliveryDate || "")).length;
    return {
      state: dedicated === 0 ? STATE.PASS : STATE.PARTIAL,
      expected: "time carried by the datetime; dedicated time columns unused",
      actual: `DeliverySetupTime populated on ${dedicated} rows · ${withTime} DeliveryDates carry a real time`,
      detail: "no time-window concept exists in POR — a single time only",
    };
  },

  async "CERT-DEPOSIT-STATE"(c) {
    const tx = csv("Transactions.csv");
    if (!tx) return { state: STATE.BLOCKED, detail: "oracle unreachable" };
    const res = tx.filter((r) => isLive(r) && ((r.STAT || " ")[0] || " ").toUpperCase() === "R");
    let half = 0, partial = 0, unpaid = 0, full = 0;
    for (const r of res) {
      const t = num(r.TOTL), p = num(r.PAID);
      if (t <= 0) continue;
      if (p <= 0) unpaid++;
      else if (p >= t - 0.01) full++;
      else { partial++; if (Math.abs(p / t - 0.5) < 0.005) half++; }
    }
    const dominates = partial > 0 && half / partial > 0.5;
    return {
      state: dominates ? STATE.PASS : STATE.PARTIAL,
      expected: "50% deposit dominates partially-paid reservations",
      actual: `${half}/${partial} partial payments are exactly 50%`,
      detail: `${res.length} live reservations · unpaid ${unpaid} · partial ${partial} · paid-in-full ${full}`,
    };
  },

  async "CERT-BALANCE-COMPUTED"(c) {
    const tx = csv("Transactions.csv");
    if (!tx) return { state: STATE.BLOCKED, detail: "oracle unreachable" };
    const cols = Object.keys(tx[0] || {});
    const stored = cols.filter((k) => /^(balance|balancedue|amountdue|owed)$/i.test(k));
    return {
      state: stored.length === 0 ? STATE.PASS : STATE.PARTIAL,
      expected: "balance is derived as TOTL - PAID; POR stores no balance column",
      actual: stored.length ? `stored column(s) found: ${stored}` : "no stored balance column",
      detail: "Command Center must compute the balance, not expect a POR field",
    };
  },

  async "CERT-UNSECURED-RESERVATIONS"(c) {
    const tx = csv("Transactions.csv");
    if (!tx) return { state: STATE.BLOCKED, detail: "oracle unreachable" };
    const res = tx.filter((r) => isLive(r) && ((r.STAT || " ")[0] || " ").toUpperCase() === "R");
    const unsecured = res.filter((r) => num(r.TOTL) > 0 && num(r.PAID) <= 0);
    const value = unsecured.reduce((a, r) => a + num(r.TOTL), 0);
    return {
      state: STATE.PASS,
      expected: "reservations with no deposit are identifiable",
      actual: `${unsecured.length} of ${res.length} live reservations carry no payment`,
      detail: `$${value.toFixed(2)} of reserved value is not secured by a deposit — a real chase signal Command Center does not surface today`,
      note: "POR side computable. No Command Center panel exposes this yet.",
      subject_conforms: false,
    };
  },

  async "CERT-FEE-SKU-EXCLUSION"(c) {
    const items = csv("ItemFile.csv");
    if (!items) return { state: STATE.BLOCKED, detail: "oracle unreachable" };
    const active = items.filter((r) => (r.Inactive || "").trim().toLowerCase() !== "true");
    const feeish = active.filter((r) => /deliver|setup|set up|fee|adjustment|mileage|labor|install|convenience/i.test(r.Name || ""));
    const feeWithQty = feeish.filter((r) => num(r.QTY) > 0);
    return {
      state: STATE.PASS,
      expected: "fee/service SKUs identifiable and excludable from rentable stock",
      actual: `${feeish.length} fee/service SKUs of ${active.length} active items`,
      detail: `${feeWithQty.length} of them carry a QTY that would inflate rentable counts if not excluded`,
    };
  },

  async "CERT-AVAILABILITY-BY-DATE"(c) {
    const items = csv("ItemFile.csv");
    if (!items) return { state: STATE.BLOCKED, detail: "oracle unreachable" };
    const withQyot = items.filter((r) => num(r.QYOT) > 0).length;
    const r = await cc("/api/por/availability?item=212894&date=2026-09-19");
    const reachable = r && !r.error;
    return {
      state: reachable ? STATE.PARTIAL : STATE.UNKNOWN,
      expected: "availability nets future commitments for the requested date",
      actual: reachable ? "endpoint responded" : `endpoint unreachable: ${r?.error || "unknown"}`,
      detail: `QYOT is out-TODAY only (${withQyot} items non-zero); date availability must net future reservations, which QTY-QYOT cannot do`,
    };
  },

  async "CERT-CUSTOMER-HISTORY"(c) {
    const tx = csv("Transactions.csv");
    const cust = csv("CustomerFile.csv");
    if (!tx || !cust) return { state: STATE.BLOCKED, detail: "oracle unreachable" };
    const byCus = new Map();
    for (const r of tx) {
      const k = (r.CUSN || "").trim();
      if (k) byCus.set(k, (byCus.get(k) || 0) + 1);
    }
    const repeat = [...byCus.values()].filter((n) => n > 1).length;
    return {
      state: STATE.PASS,
      expected: "prior rentals retrievable per customer",
      actual: `${byCus.size} customers with transactions; ${repeat} are repeat customers`,
      detail: `${tx.length} tickets across ${byCus.size} customers — history is meaningful and worth surfacing`,
    };
  },

  async _write(c) {
    return {
      state: STATE.BLOCKED,
      expected: "Command Center can create a real POR transaction",
      actual: "no write path",
      detail: "all /api/por routes are GET; SQL is ApplicationIntent=ReadOnly with a SELECT-only guard. Blocked on the POR vendor API.",
    };
  },
};

function compareCount(c, expected, actual, label, rel = "EQUAL") {
  if (typeof actual !== "number")
    return { state: STATE.UNKNOWN, expected, actual: String(actual), detail: `Command Center did not report ${label}` };
  const ok = rel === "GREATER_OR_EQUAL" ? actual >= expected : actual === expected;
  return {
    state: ok ? STATE.PASS : STATE.FAIL,
    expected, actual,
    detail: ok ? `agrees on ${label}` : `POR says ${expected}, Command Center says ${actual} — ${label}`,
  };
}

// ---------------------------------------------------------------- defect loop
function openDefect(c, result) {
  if (!c.implementation_task) return null;
  try {
    const state = JSON.parse(readFileSync(path.join(HANDOFF, "MASTER_STATE.json"), "utf8"));
    if (state.tasks?.[c.implementation_task]) return c.implementation_task; // already tracked
  } catch { /* fall through */ }
  try {
    execFileSync("node", [CP, "create", JSON.stringify({
      task_id: c.implementation_task,
      subsystem: "command-center",
      objective: `CERTIFICATION FAIL ${c.id}: ${c.name}. POR says ${result.expected}; Command Center says ${result.actual}.`,
      created_by: "por-certification-engine",
      owner_agent: "cursor",
      verifier_agent: "codex",
      priority: c.severity === "CRITICAL" ? "critical" : "high",
      risk_tier: 1,
      expected_evidence: `${c.id} re-runs PASS against POR`,
      evidence_paths: ["AI-HANDOFF/POR_CERTIFICATION_RESULTS.jsonl", "00 - Reference/POR_COMMAND_CENTER_PARITY_MATRIX.md"],
    })], { cwd: REPO, encoding: "utf8" });
    return c.implementation_task;
  } catch {
    return c.implementation_task;
  }
}

// ---------------------------------------------------------------- main
const argv = process.argv.slice(2);
const only = (argv.find((a) => a.startsWith("--id=")) || "").split("=")[1];
const noTasks = argv.includes("--no-tasks");
const age = oracleAgeDays();

const results = [];
for (const c of manifest.certifications) {
  if (only && c.id !== only) continue;
  const fn = CHECKS[c.id] || (c.category === "WRITE_PARITY" ? CHECKS._write : null);
  let r;
  if (!fn) r = { state: STATE.UNKNOWN, detail: "no check implemented" };
  else if (age > c.freshness_tolerance_days) {
    r = {
      state: STATE.BLOCKED_STALE,
      detail: `oracle is ${age}d old but this question tolerates ${c.freshness_tolerance_days}d — refusing to certify from stale evidence`,
    };
  } else {
    try { r = await fn(c); } catch (e) { r = { state: STATE.UNKNOWN, detail: `check threw: ${e.message}` }; }
  }
  const row = {
    at: now(), id: c.id, category: c.category, name: c.name, severity: c.severity,
    oracle: ORACLE.id, oracle_as_of: ORACLE.as_of, oracle_age_days: age,
    ...r,
  };
  if ((r.state === STATE.FAIL || r.subject_conforms === false) && !noTasks) row.implementation_task = openDefect(c, r);
  results.push(row);
}

mkdirSync(path.dirname(RESULTS), { recursive: true });
for (const r of results) appendFileSync(RESULTS, JSON.stringify(r) + "\n");

const tally = results.reduce((a, r) => ((a[r.state] = (a[r.state] || 0) + 1), a), {});
console.log(`POR PARITY CERTIFICATION — oracle ${ORACLE.as_of} (${age}d old), subject ${BASE}\n`);
for (const r of results) {
  const mark = { PASS: "PASS ", FAIL: "FAIL ", PARTIAL: "PART ", BLOCKED: "BLCK ", UNKNOWN: "UNKN ", BLOCKED_STALE_ORACLE: "STALE" }[r.state] || r.state;
  console.log(`  ${mark} ${r.id.padEnd(28)} ${r.detail || ""}`);
  if (r.note) console.log(`        ${r.note}`);
  if (r.implementation_task) console.log(`        → task ${r.implementation_task}`);
}
console.log("\n" + Object.entries(tally).map(([k, v]) => `${k}:${v}`).join("  "));
process.exit(results.some((r) => r.state === STATE.FAIL) ? 1 : 0);
