import { readDurableJson } from "@/lib/durable-json";
import { getPorCatalog } from "@/lib/por-catalog";
import type { PorReservationState } from "@/lib/types";

/**
 * Availability-by-date / overbooking. Reservations come from POR
 * (Transactions + TransactionItems). Firm holds (Status R or O) reduce
 * availability; soft holds (Q quotes) are pending warnings only.
 * Total owned qty comes from the full catalog (ItemFile.QTY).
 */
const KEY = "por-reservations.json";
const CACHE_MS = 5 * 60 * 1000;
let cache: { state: PorReservationState; at: number } | null = null;

function empty(): PorReservationState {
  return { reservations: [], syncedAt: "", source: "" };
}

export async function getReservations(): Promise<PorReservationState> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.state;
  const s = await readDurableJson<PorReservationState>(KEY, empty());
  const safe: PorReservationState = {
    ...empty(),
    ...s,
    reservations: Array.isArray(s.reservations) ? s.reservations : [],
  };
  cache = { state: safe, at: Date.now() };
  return safe;
}

function coversDate(delivery: string, pickup: string, day: number): boolean {
  const del = Date.parse(delivery);
  if (!Number.isFinite(del)) return false;
  const pick = Date.parse(pickup);
  const end = Number.isFinite(pick) ? pick : del;
  return day >= del && day <= end;
}

export interface ItemAvailability {
  itemKey: string;
  total: number;
  firmHeld: number;
  softHeld: number;
  available: number;
}

export async function availableOn(
  itemKey: string,
  dateISO: string,
): Promise<ItemAvailability> {
  const key = itemKey.trim();
  const { reservations } = await getReservations();
  const { items } = await getPorCatalog();
  const cat = items.find((i) => i.sku === key);
  const num = (cat?.num ?? "").trim();
  const total = cat ? cat.qty : 0;
  const day = Date.parse(dateISO);
  let firm = 0;
  let soft = 0;
  if (Number.isFinite(day) && num) {
    for (const r of reservations) {
      if (r.itemKey !== num) continue;
      if (!coversDate(r.delivery, r.pickup, day)) continue;
      if (r.firm) firm += r.qty;
      else soft += r.qty;
    }
  }
  return { itemKey: key, total, firmHeld: firm, softHeld: soft, available: Math.max(0, total - firm) };
}

export interface AvailabilityLineResult extends ItemAvailability {
  requested: number;
  overbooked: boolean;
  tight: boolean;
}

/** Check a quote's lines against a target event date. */
export async function checkQuoteAvailability(
  lines: Array<{ itemKey: string; qty: number }>,
  dateISO: string,
): Promise<AvailabilityLineResult[]> {
  const out: AvailabilityLineResult[] = [];
  for (const l of lines) {
    const a = await availableOn(l.itemKey, dateISO);
    const requested = Math.max(0, Math.round(l.qty || 0));
    const overbooked = requested > a.available;
    const tight = !overbooked && requested > a.available - a.softHeld;
    out.push({ ...a, requested, overbooked, tight });
  }
  return out;
}
