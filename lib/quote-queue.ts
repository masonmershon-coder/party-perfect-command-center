import { readDurableJson, writeDurableJson } from "@/lib/durable-json";
import type {
  Quote,
  QuoteCustomerEvent,
  QuoteQueueStatus,
  SavedQuote,
} from "@/lib/types";

const KEY = "quotes.json";

function emptyCustomer(): QuoteCustomerEvent {
  return {
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    eventDate: "",
    eventStartTime: "",
    fulfillment: "pickup",
    salesRep: "",
  };
}

function newId() {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function listSavedQuotes(): Promise<SavedQuote[]> {
  const rows = await readDurableJson<SavedQuote[]>(KEY, []);
  return [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSavedQuote(id: string): Promise<SavedQuote | null> {
  const rows = await listSavedQuotes();
  return rows.find((r) => r.id === id) ?? null;
}

export async function createSavedQuote(input: {
  createdBy?: string;
  status?: QuoteQueueStatus;
  customer?: Partial<QuoteCustomerEvent>;
  quote: Quote;
  emailDraft: string;
  ticketText: string;
  overbookOverride?: SavedQuote["overbookOverride"];
}): Promise<SavedQuote> {
  const now = new Date().toISOString();
  const row: SavedQuote = {
    id: newId(),
    createdBy: (input.createdBy || "showroom").trim().slice(0, 80) || "showroom",
    createdAt: now,
    updatedAt: now,
    status: input.status ?? "draft",
    customer: { ...emptyCustomer(), ...(input.customer || {}) },
    quote: input.quote,
    emailDraft: input.emailDraft || "",
    ticketText: input.ticketText || "",
    overbookOverride: input.overbookOverride,
  };
  const rows = await listSavedQuotes();
  rows.unshift(row);
  await writeDurableJson(KEY, rows);
  return row;
}

export async function updateSavedQuote(
  id: string,
  patch: {
    status?: QuoteQueueStatus;
    customer?: Partial<QuoteCustomerEvent>;
    quote?: Quote;
    emailDraft?: string;
    ticketText?: string;
    createdBy?: string;
    overbookOverride?: SavedQuote["overbookOverride"] | null;
  },
): Promise<SavedQuote | null> {
  const rows = await listSavedQuotes();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const prev = rows[idx];
  const next: SavedQuote = {
    ...prev,
    updatedAt: new Date().toISOString(),
    status: patch.status ?? prev.status,
    customer: patch.customer
      ? { ...prev.customer, ...patch.customer }
      : prev.customer,
    quote: patch.quote ?? prev.quote,
    emailDraft: patch.emailDraft ?? prev.emailDraft,
    ticketText: patch.ticketText ?? prev.ticketText,
    createdBy: patch.createdBy?.trim()
      ? patch.createdBy.trim().slice(0, 80)
      : prev.createdBy,
    overbookOverride:
      patch.overbookOverride === null
        ? undefined
        : (patch.overbookOverride ?? prev.overbookOverride),
  };
  rows[idx] = next;
  await writeDurableJson(KEY, rows);
  return next;
}

export async function deleteSavedQuote(id: string): Promise<boolean> {
  const rows = await listSavedQuotes();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  await writeDurableJson(KEY, next);
  return true;
}
