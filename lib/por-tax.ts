/**
 * Customer TaxCode → TaxTable. Never a store-wide hardcoded rate.
 *
 * Verified against POR TaxTable (Claude packet POR-PARITY-TAXCODE-001):
 *   code 1: TaxRent1 = TaxSale1 = 0.08517, TaxDW1 empty (waiver not taxed)
 *   code 3 ("Osage Co"): 0.0575 rent/sale AND taxes waiver at 0.05
 *
 * Additional codes load from durable `por-tax-table.json` when ENTERPRISE syncs
 * TaxTable. Unknown codes do not invent a rate.
 */

import { readDurableJson, writeDurableJson } from "@/lib/durable-json";

const KEY = "por-tax-table.json";

export interface PorTaxCodeRow {
  code: string;
  name?: string;
  taxRent: number;
  taxSale: number;
  /** Empty / 0 = waiver is not taxed (code 1). */
  taxDw: number;
}

export interface PorTaxTableState {
  rows: PorTaxCodeRow[];
  syncedAt: string;
  source: string;
}

/** Packet-verified TaxTable rows. Do not invent additional codes here. */
export const VERIFIED_POR_TAX_CODES: PorTaxCodeRow[] = [
  {
    code: "1",
    name: "TaxCode 1",
    taxRent: 0.08517,
    taxSale: 0.08517,
    taxDw: 0,
  },
  {
    code: "3",
    name: "Osage Co",
    taxRent: 0.0575,
    taxSale: 0.0575,
    taxDw: 0.05,
  },
];

function normalizeCode(code: string | null | undefined): string {
  return String(code ?? "").trim();
}

export async function getPorTaxTable(): Promise<PorTaxTableState> {
  const state = await readDurableJson<PorTaxTableState>(KEY, {
    rows: [],
    syncedAt: "",
    source: "",
  });
  const extra = Array.isArray(state.rows) ? state.rows : [];
  const byCode = new Map<string, PorTaxCodeRow>();
  for (const row of VERIFIED_POR_TAX_CODES) byCode.set(row.code, row);
  for (const row of extra) {
    const code = normalizeCode(row.code);
    if (!code) continue;
    byCode.set(code, {
      code,
      name: row.name,
      taxRent: Number(row.taxRent) || 0,
      taxSale: Number(row.taxSale) || 0,
      taxDw: Number(row.taxDw) || 0,
    });
  }
  return {
    rows: [...byCode.values()],
    syncedAt: state.syncedAt || "",
    source: state.source || "verified-packet",
  };
}

export async function savePorTaxTable(state: PorTaxTableState): Promise<void> {
  await writeDurableJson(KEY, {
    ...state,
    rows: Array.isArray(state.rows) ? state.rows : [],
    syncedAt: state.syncedAt || new Date().toISOString(),
  });
}

export function findTaxCodeRow(
  table: PorTaxTableState | PorTaxCodeRow[],
  code: string | null | undefined,
): PorTaxCodeRow | null {
  const want = normalizeCode(code);
  if (!want) return null;
  const rows = Array.isArray(table) ? table : table.rows;
  return (
    rows.find((r) => normalizeCode(r.code) === want) ||
    rows.find((r) => normalizeCode(r.code) === String(Number(want))) ||
    null
  );
}

export async function resolveTaxCode(
  code: string | null | undefined,
): Promise<PorTaxCodeRow | null> {
  const table = await getPorTaxTable();
  return findTaxCodeRow(table, code);
}
