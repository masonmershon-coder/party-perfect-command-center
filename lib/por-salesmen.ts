/**
 * POR Salesman table mirror for Quote Desk picker.
 * Do not invent names — only what sync / CRM has stored.
 */

import { readDurableJson, writeDurableJson } from "@/lib/durable-json";

const KEY = "por-salesmen.json";

export interface PorSalesmanRow {
  id: string;
  name: string;
}

export interface PorSalesmenState {
  rows: PorSalesmanRow[];
  syncedAt: string;
  source: string;
}

function empty(): PorSalesmenState {
  return { rows: [], syncedAt: "", source: "" };
}

export async function getPorSalesmen(): Promise<PorSalesmenState> {
  const state = await readDurableJson<PorSalesmenState>(KEY, empty());
  return {
    ...empty(),
    ...state,
    rows: Array.isArray(state.rows)
      ? state.rows.filter((r) => r && String(r.name || "").trim())
      : [],
  };
}

export async function savePorSalesmen(state: PorSalesmenState): Promise<void> {
  await writeDurableJson(KEY, {
    rows: Array.isArray(state.rows) ? state.rows : [],
    syncedAt: state.syncedAt || new Date().toISOString(),
    source: state.source || "ENTERPRISE",
  });
}
