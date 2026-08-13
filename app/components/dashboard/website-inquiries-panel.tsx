"use client";

import type { WebQuoteInquiry } from "@/lib/web-quote-inquiry";
import { formatTime } from "@/lib/ui";

function intentLabel(intent: WebQuoteInquiry["intent"]) {
  if (intent === "tent") return "Tent consult";
  if (intent === "help") return "Help";
  return "Quote";
}

export function WebsiteInquiriesPanel({
  inquiries,
  onStartQuote,
  onHandled,
}: {
  inquiries: WebQuoteInquiry[];
  onStartQuote: (row: WebQuoteInquiry) => void;
  onHandled: (id: string) => void;
}) {
  const open = inquiries.filter((r) => r.status !== "handled");
  if (open.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-accent-muted)]/60 p-4">
      <p className="text-sm font-medium text-[var(--pp-text)]">
        Website inquiries
      </p>
      <p className="mt-1 text-xs leading-5 text-[var(--pp-text-muted)]">
        From partyperfect.app/get-quote. Contact + event notes only — no online
        rates. Start a showroom quote from live POR; this list does not change
        saved quotes.
      </p>
      <ul className="mt-3 space-y-2">
        {open.slice(0, 12).map((row) => (
          <li
            key={row.id}
            className="rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-4 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-[var(--pp-text)]">
                  {row.customerName}{" "}
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
                    {intentLabel(row.intent)} · {row.status}
                  </span>
                </p>
                <p className="text-xs text-[var(--pp-text-muted)]">
                  {row.phone} · {row.email}
                  {row.eventDate ? ` · ${row.eventDate}` : ""}
                  {row.guestCount ? ` · ${row.guestCount} guests` : ""}
                </p>
                {row.notes ? (
                  <p className="mt-1 text-xs leading-5 text-[var(--pp-text)]">
                    {row.notes.slice(0, 220)}
                    {row.notes.length > 220 ? "…" : ""}
                  </p>
                ) : null}
                <p className="mt-1 text-[10px] text-[var(--pp-text-muted)]">
                  {formatTime(row.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="pp-btn-primary px-3 py-2 text-xs"
                  onClick={() => onStartQuote(row)}
                >
                  Start quote
                </button>
                <button
                  type="button"
                  className="pp-btn-secondary px-3 py-2 text-xs"
                  onClick={() => onHandled(row.id)}
                >
                  Mark handled
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
