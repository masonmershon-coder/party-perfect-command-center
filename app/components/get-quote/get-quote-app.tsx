"use client";

import { PartyPerfectLogo } from "@/app/components/dashboard/party-perfect-logo";
import {
  CAREERS_URL,
  CATALOG_URL,
  CONTACT_URL,
  CUSTOMER_SITE_URL,
  EMPTY_QUOTE_CHOICES,
  EMPTY_QUOTE_HEADING,
  EMPTY_QUOTE_INTRO,
  RENTAL_POSITIONING_LINE,
  SHOWROOM_EMAIL,
  SHOWROOM_PHONE_DISPLAY,
  SHOWROOM_PHONE_TEL,
  type EmptyQuoteChoiceId,
} from "@/lib/website-positioning";
import { isValidEmail, isValidUsPhone } from "@/lib/job-apply-validate";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

type Stage = "choices" | "form" | "success";
type Intent = Exclude<EmptyQuoteChoiceId, "browse">;

const INTENT_COPY: Record<
  Intent,
  { title: string; blurb: string; submit: string }
> = {
  quote: {
    title: "Start a rental quote",
    blurb:
      "Share the event basics. Showroom builds the official quote from live Point of Rental inventory — no online rates invented here.",
    submit: "Send quote request",
  },
  help: {
    title: "Request rental help",
    blurb:
      "A showroom specialist will follow up. You can also call or visit — no appointment needed.",
    submit: "Send message",
  },
  tent: {
    title: "Tent / large-event consultation",
    blurb:
      "Tents, flooring, climate, and large outdoor events need a specialist. Tell us the date and venue.",
    submit: "Request consultation",
  },
};

function intentFromParam(raw: string | null): Intent | null {
  if (raw === "quote" || raw === "help" || raw === "tent") return raw;
  return null;
}

export function GetQuoteApp() {
  const params = useSearchParams();
  const initialIntent = intentFromParam(params.get("intent"));
  const [stage, setStage] = useState<Stage>(initialIntent ? "form" : "choices");
  const [intent, setIntent] = useState<Intent>(initialIntent ?? "quote");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [venue, setVenue] = useState("");
  const [fulfillment, setFulfillment] = useState<"" | "pickup" | "delivery">("");
  const [notes, setNotes] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = INTENT_COPY[intent];

  const canSubmit = useMemo(() => {
    return (
      name.trim().length >= 2 &&
      isValidUsPhone(phone) &&
      isValidEmail(email) &&
      !busy
    );
  }, [name, phone, email, busy]);

  function openChoice(id: EmptyQuoteChoiceId) {
    if (id === "browse") {
      window.location.href = CATALOG_URL;
      return;
    }
    setIntent(id);
    setError(null);
    setStage("form");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/get-quote/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent,
          customerName: name,
          phone,
          email,
          eventDate,
          guestCount,
          venue,
          fulfillment,
          notes,
          companyUrl,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };
      if (!res.ok) {
        throw new Error(payload.error || "Could not send. Call the showroom.");
      }
      setStage("success");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-5 pb-16 pt-6 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <a href={CUSTOMER_SITE_URL} className="inline-flex items-center gap-3">
          <PartyPerfectLogo variant="compact" />
        </a>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-[var(--gq-muted)]">
          <a href={CATALOG_URL} className="hover:text-[var(--gq-teal-deep)]">
            Catalog
          </a>
          <a href={CONTACT_URL} className="hover:text-[var(--gq-teal-deep)]">
            Contact
          </a>
          <a
            href={`tel:${SHOWROOM_PHONE_TEL}`}
            className="hover:text-[var(--gq-teal-deep)]"
          >
            {SHOWROOM_PHONE_DISPLAY}
          </a>
          <a
            href={CAREERS_URL}
            className="text-[var(--gq-teal-deep)] hover:underline"
          >
            Careers
          </a>
        </nav>
      </header>

      {stage === "choices" ? (
        <section className="mt-10 sm:mt-14">
          <p className="gq-display text-sm font-bold uppercase tracking-[0.28em] text-[var(--gq-teal-deep)]">
            Party Perfect Event Rentals
          </p>
          <h2 className="gq-display mt-3 max-w-3xl text-4xl font-extrabold leading-[1.08] text-[var(--gq-ink)] sm:text-5xl">
            {EMPTY_QUOTE_HEADING}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--gq-muted)] sm:text-lg">
            {EMPTY_QUOTE_INTRO}
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--gq-muted)]">
            {RENTAL_POSITIONING_LINE}
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {EMPTY_QUOTE_CHOICES.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => openChoice(choice.id)}
                className="gq-card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(0,158,136,0.12)]"
              >
                <p className="gq-display text-xl font-extrabold text-[var(--gq-ink)]">
                  {choice.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--gq-muted)]">
                  {choice.description}
                </p>
                <p className="mt-4 text-sm font-extrabold text-[var(--gq-teal-deep)]">
                  Continue →
                </p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {stage === "form" ? (
        <section className="mt-10 max-w-xl sm:mt-12">
          <button
            type="button"
            className="text-sm font-semibold text-[var(--gq-teal-deep)]"
            onClick={() => {
              setStage("choices");
              setError(null);
            }}
          >
            ← All options
          </button>
          <h2 className="gq-display mt-4 text-3xl font-extrabold sm:text-4xl">
            {copy.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--gq-muted)] sm:text-base">
            {copy.blurb}
          </p>

          <form className="mt-8 space-y-4" onSubmit={(e) => void onSubmit(e)}>
            <label className="block text-sm font-semibold">
              Name
              <input
                className="gq-input mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </label>
            <label className="block text-sm font-semibold">
              Phone
              <input
                className="gq-input mt-1"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                inputMode="tel"
                required
              />
            </label>
            <label className="block text-sm font-semibold">
              Email
              <input
                className="gq-input mt-1"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Event date
                <input
                  className="gq-input mt-1"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </label>
              <label className="block text-sm font-semibold">
                Guest count
                <input
                  className="gq-input mt-1"
                  inputMode="numeric"
                  value={guestCount}
                  onChange={(e) => setGuestCount(e.target.value)}
                />
              </label>
            </div>
            <label className="block text-sm font-semibold">
              Venue / location
              <input
                className="gq-input mt-1"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold">
              Pickup or delivery
              <select
                className="gq-input mt-1"
                value={fulfillment}
                onChange={(e) =>
                  setFulfillment(e.target.value as typeof fulfillment)
                }
              >
                <option value="">Not sure yet</option>
                <option value="pickup">Customer pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">
              What do you need?
              <textarea
                className="gq-input mt-1 min-h-[120px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  intent === "tent"
                    ? "Tent size, outdoor vs indoor, flooring, guest count…"
                    : "Linens, tables, chairs, china, dance floor, décor…"
                }
              />
            </label>
            <div className="hidden" aria-hidden="true">
              <label>
                Company URL
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={companyUrl}
                  onChange={(e) => setCompanyUrl(e.target.value)}
                />
              </label>
            </div>
            {error ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={!canSubmit}
              className="gq-cta w-full px-6 py-3.5 text-base disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Sending…" : copy.submit}
            </button>
            <p className="text-xs leading-5 text-[var(--gq-muted)]">
              Or call{" "}
              <a className="font-semibold underline" href={`tel:${SHOWROOM_PHONE_TEL}`}>
                {SHOWROOM_PHONE_DISPLAY}
              </a>{" "}
              ·{" "}
              <a className="font-semibold underline" href={`mailto:${SHOWROOM_EMAIL}`}>
                {SHOWROOM_EMAIL}
              </a>
            </p>
          </form>
        </section>
      ) : null}

      {stage === "success" ? (
        <section className="mt-16 max-w-xl">
          <p className="gq-display text-sm font-bold uppercase tracking-[0.28em] text-[var(--gq-teal-deep)]">
            Request received
          </p>
          <h2 className="gq-display mt-3 text-3xl font-extrabold sm:text-4xl">
            Showroom has your note.
          </h2>
          <p className="mt-3 text-base leading-7 text-[var(--gq-muted)]">
            A rental specialist will follow up. Official pricing comes from live
            Point of Rental inventory — nothing was quoted automatically.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={CATALOG_URL} className="gq-cta px-6 py-3 text-sm">
              Browse inventory
            </a>
            <a
              href={CUSTOMER_SITE_URL}
              className="rounded-2xl border border-[rgba(0,158,136,0.25)] px-6 py-3 text-center text-sm font-extrabold text-[var(--gq-teal-deep)]"
            >
              Back to Party Perfect
            </a>
          </div>
        </section>
      ) : null}

      <footer className="mt-auto pt-16 text-sm text-[var(--gq-muted)]">
        <p>
          Party Perfect Event Rentals · 8401 E 41st St, Tulsa OK 74145 ·{" "}
          <a className="font-semibold underline" href={`tel:${SHOWROOM_PHONE_TEL}`}>
            {SHOWROOM_PHONE_DISPLAY}
          </a>
        </p>
        <p className="mt-2">
          <a className="font-semibold text-[var(--gq-teal-deep)] underline" href={CAREERS_URL}>
            Careers / hiring — partyperfectjobs.com
          </a>
        </p>
      </footer>
    </div>
  );
}
