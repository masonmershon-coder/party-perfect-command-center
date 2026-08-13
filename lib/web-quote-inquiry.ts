/**
 * Public website quote / help / tent consultation intake.
 * Stores contact + event notes only — never invents rates or POR lines.
 */

import { readDurableJson, writeDurableJson } from "@/lib/durable-json";
import {
  isValidEmail,
  isValidUsPhone,
  normalizeEmailKey,
  normalizePhoneDigits,
} from "@/lib/job-apply-validate";

const KEY = "web-quote-inquiries.json";
const MAX_NOTES = 2000;

export type WebQuoteIntent = "quote" | "help" | "tent";
export type WebQuoteInquiryStatus = "new" | "open" | "handled";

export interface WebQuoteInquiry {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: WebQuoteInquiryStatus;
  intent: WebQuoteIntent;
  customerName: string;
  phone: string;
  email: string;
  eventDate: string;
  guestCount: string;
  venue: string;
  fulfillment: "pickup" | "delivery" | "";
  notes: string;
  source: "get-quote";
}

export interface WebQuoteInquiryInput {
  intent: WebQuoteIntent;
  customerName: string;
  phone: string;
  email: string;
  eventDate?: string;
  guestCount?: string;
  venue?: string;
  fulfillment?: "pickup" | "delivery" | "";
  notes?: string;
  /** Honeypot — bots fill this; humans never see it. */
  companyUrl?: string;
}

type ValidateOk = { ok: true; value: WebQuoteInquiryInput };
type ValidateFail = { ok: false; error: string; spam?: boolean };

const INTENTS = new Set<WebQuoteIntent>(["quote", "help", "tent"]);

function cleanText(raw: unknown, max: number): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00`);
  return Number.isFinite(t);
}

export function validateWebQuoteInquiryInput(raw: unknown): ValidateOk | ValidateFail {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const honeypot = cleanText(body.companyUrl ?? body.website ?? body.fax, 200);
  if (honeypot) {
    return { ok: false, error: "Thanks — we’ll be in touch.", spam: true };
  }

  const intentRaw = cleanText(body.intent, 20).toLowerCase();
  if (!INTENTS.has(intentRaw as WebQuoteIntent)) {
    return {
      ok: false,
      error: "Choose start a quote, request help, or tent consultation.",
    };
  }
  const intent = intentRaw as WebQuoteIntent;

  const customerName = cleanText(body.customerName ?? body.name, 80);
  if (customerName.length < 2) {
    return { ok: false, error: "Enter your name." };
  }

  const phone = String(body.phone ?? "").trim();
  if (!isValidUsPhone(phone)) {
    return { ok: false, error: "Enter a valid US phone number." };
  }

  const email = String(body.email ?? "").trim();
  if (!isValidEmail(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const eventDate = cleanText(body.eventDate, 12);
  if (eventDate && !isIsoDate(eventDate)) {
    return { ok: false, error: "Enter a valid event date." };
  }

  const guestCount = cleanText(body.guestCount, 12);
  if (guestCount && !/^\d{1,5}$/.test(guestCount)) {
    return { ok: false, error: "Guest count should be a number." };
  }

  const fulfillmentRaw = cleanText(body.fulfillment, 20).toLowerCase();
  const fulfillment =
    fulfillmentRaw === "delivery" || fulfillmentRaw === "pickup"
      ? fulfillmentRaw
      : "";

  return {
    ok: true,
    value: {
      intent,
      customerName,
      phone: normalizePhoneDigits(phone),
      email: normalizeEmailKey(email),
      eventDate,
      guestCount,
      venue: cleanText(body.venue, 160),
      fulfillment,
      notes: String(body.notes ?? "")
        .trim()
        .slice(0, MAX_NOTES),
    },
  };
}

function newId() {
  return `wq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function listWebQuoteInquiries(): Promise<WebQuoteInquiry[]> {
  const rows = await readDurableJson<WebQuoteInquiry[]>(KEY, []);
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createWebQuoteInquiry(
  input: WebQuoteInquiryInput,
): Promise<WebQuoteInquiry> {
  const now = new Date().toISOString();
  const row: WebQuoteInquiry = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    status: "new",
    intent: input.intent,
    customerName: input.customerName,
    phone: input.phone,
    email: input.email,
    eventDate: input.eventDate || "",
    guestCount: input.guestCount || "",
    venue: input.venue || "",
    fulfillment: input.fulfillment || "",
    notes: input.notes || "",
    source: "get-quote",
  };
  const rows = await listWebQuoteInquiries();
  rows.unshift(row);
  await writeDurableJson(KEY, rows.slice(0, 500));
  return row;
}

export async function updateWebQuoteInquiryStatus(
  id: string,
  status: WebQuoteInquiryStatus,
): Promise<WebQuoteInquiry | null> {
  if (status !== "new" && status !== "open" && status !== "handled") {
    return null;
  }
  const rows = await listWebQuoteInquiries();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const next: WebQuoteInquiry = {
    ...rows[idx],
    status,
    updatedAt: new Date().toISOString(),
  };
  rows[idx] = next;
  await writeDurableJson(KEY, rows);
  return next;
}

export function inquiryTicketText(row: WebQuoteInquiry): string {
  const intentLabel =
    row.intent === "tent"
      ? "Tent / large-event consultation"
      : row.intent === "help"
        ? "Request help"
        : "Start a quote";
  return [
    `WEBSITE INQUIRY (${intentLabel})`,
    `Name: ${row.customerName}`,
    `Phone: ${row.phone}`,
    `Email: ${row.email}`,
    `Event date: ${row.eventDate || "—"}`,
    `Guest count: ${row.guestCount || "—"}`,
    `Venue: ${row.venue || "—"}`,
    `Fulfillment: ${row.fulfillment || "—"}`,
    `Notes: ${row.notes || "—"}`,
    "",
    "No rates or inventory were quoted online. Build the official quote from live POR.",
  ].join("\n");
}
