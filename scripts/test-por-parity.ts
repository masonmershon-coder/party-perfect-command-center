/**
 * POR parity packets — engine + STAT decode. No invented rates.
 * Run: npx tsx scripts/test-por-parity.ts
 */
import { buildQuote } from "../lib/quote-engine";
import {
  formatPorStatusPlain,
  getPorPrimaryChar,
  getPorSecondaryChar,
  getPorStatusClass,
  inPorScope,
} from "../lib/por-status";
import { findTaxCodeRow, VERIFIED_POR_TAX_CODES } from "../lib/por-tax";
import { QUOTE_HOLD_DAYS } from "../lib/por-availability";
import { isKitHeader } from "../lib/por-kits";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

// PKT-1 waiver = 5% of RENT only
const mixed = buildQuote({
  productLines: [
    { qty: 10, description: "Chiavari chair", unitRate: 8, chargeKind: "rent" },
    { qty: 2, description: "Sale linen", unitRate: 50, chargeKind: "sale" },
  ],
  taxRow: findTaxCodeRow(VERIFIED_POR_TAX_CODES, "1"),
  taxCode: "1",
});
assert(mixed.totals.rentSubtotal === 80, "rent subtotal 10×8=80");
assert(mixed.totals.saleSubtotal === 100, "sale subtotal 2×50=100");
assert(mixed.totals.damageWaiver === 4, "waiver 5% of 80 = 4, not 5% of 180");
assert(mixed.productLines[0].dmgWvr === 4, "line DmgWvr on rent line");
assert(mixed.productLines[1].dmgWvr === 0, "no DmgWvr on sale line");

const exempt = buildQuote({
  productLines: [{ qty: 10, description: "Chair", unitRate: 8, chargeKind: "rent" }],
  taxRow: findTaxCodeRow(VERIFIED_POR_TAX_CODES, "1"),
  taxCode: "1",
  damageWaiverExempt: true,
});
assert(exempt.totals.damageWaiver === 0, "DamageWaiverExempt → no waiver");

// PKT-2 tax follows TaxCode
assert(mixed.totals.taxRent === Number((80 * 0.08517).toFixed(2)), "TaxRent on rent only (code 1)");
assert(mixed.totals.taxSale === Number((100 * 0.08517).toFixed(2)), "TaxSale on sale (code 1)");
assert(mixed.totals.taxWaiver === 0, "TaxCode 1 does not tax waiver");

const osage = buildQuote({
  productLines: [{ qty: 10, description: "Chair", unitRate: 8, chargeKind: "rent" }],
  taxRow: findTaxCodeRow(VERIFIED_POR_TAX_CODES, "3"),
  taxCode: "3",
});
assert(osage.totals.taxRent === Number((80 * 0.0575).toFixed(2)), "Osage TaxRent 5.75%");
assert(osage.totals.taxWaiver === Number((4 * 0.05).toFixed(2)), "Osage taxes waiver at 5%");

const unknownTax = buildQuote({
  productLines: [{ qty: 1, description: "Chair", unitRate: 10, chargeKind: "rent" }],
  taxCode: "99",
});
assert(unknownTax.totals.salesTax === 0, "unknown TaxCode does not invent a rate");
assert(
  unknownTax.notes.some((n) => /not in TaxTable/i.test(n)),
  "unknown TaxCode notes the gap",
);

const noCode = buildQuote({
  productLines: [{ qty: 1, description: "Chair", unitRate: 10, chargeKind: "rent" }],
});
assert(noCode.totals.salesTax === 0, "missing TaxCode → no invented store-wide tax");

// PKT-6 STAT — never LTRIM
assert(getPorPrimaryChar(" R") === " ", "leading space primary is Completed, not Reservation");
assert(getPorStatusClass(" R") === "Completed", " ' R' class is Completed");
assert(getPorPrimaryChar("R ") === "R", "Reservation primary");
assert(getPorSecondaryChar("QT") === "T", "quote converted secondary T");
assert(getPorStatusClass("") === "Completed", "empty STAT = Completed");
assert(getPorStatusClass("R") === "Reservation", "bare R still Reservation if no pad");
assert(inPorScope("ActiveReservations", "R ", false, false) === true, "R live is reservation");
assert(inPorScope("ActiveReservations", " R", false, false) === false, "Completed+R secondary is NOT reservation");
assert(inPorScope("OpenQuotes", "QT", false, false) === false, "converted quote excluded");
assert(inPorScope("OpenQuotes", "Q ", false, false) === true, "open quote");
assert(formatPorStatusPlain("QT").toLowerCase().includes("converted"), "plain English converted");
assert(formatPorStatusPlain("QC").toLowerCase().includes("cancelled"), "plain English cancelled");
assert(!formatPorStatusPlain(" R").includes("Reservation"), "must not LTRIM into Reservation");

// PKT-7 kits
assert(isKitHeader({ itemType: "K" }) === true, "TYPE K is kit header");
assert(isKitHeader({ itemType: "T" }) === false, "TYPE T is not kit header");

// PKT-8 hold days constant (semantics labeled in UI; Counter expire-from-create unobserved)
assert(QUOTE_HOLD_DAYS === 4, "POR HOLD_DAYS = 4");

if (process.exitCode) {
  console.error("POR parity tests FAILED");
} else {
  console.log("PASS POR parity tests");
}
