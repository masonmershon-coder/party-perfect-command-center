"use client";

import type { PorJobSiteRecord, PorCustomerRecord } from "@/lib/por-crm";
import type { PorSalesmanRow } from "@/lib/por-salesmen";
import type { QuoteCustomerEvent } from "@/lib/types";
import { useEffect, useState, type ReactNode } from "react";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold text-[var(--pp-text-muted)]">
      {label}
      {hint ? (
        <span className="ml-1 font-normal normal-case tracking-normal">
          {hint}
        </span>
      ) : null}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function QuoteCustomerPanel({
  customer,
  busy,
  onChange,
  onBack,
  onNext,
}: {
  customer: QuoteCustomerEvent;
  busy: boolean;
  onChange: (c: QuoteCustomerEvent) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const set = (patch: Partial<QuoteCustomerEvent>) =>
    onChange({ ...customer, ...patch });
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PorCustomerRecord[]>([]);
  const [sites, setSites] = useState<PorJobSiteRecord[]>([]);
  const [salesmen, setSalesmen] = useState<PorSalesmanRow[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/por/salesmen")
      .then((r) => r.json())
      .then((d) => setSalesmen(Array.isArray(d.rows) ? d.rows : []))
      .catch(() => setSalesmen([]));
  }, []);

  async function searchCustomers() {
    const q = query.trim();
    if (q.length < 2) return;
    setLookupError(null);
    try {
      const res = await fetch(`/api/por/customer?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as {
        matches?: PorCustomerRecord[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Customer search failed");
      setHits(data.matches || []);
    } catch (err) {
      setLookupError((err as Error).message);
    }
  }

  async function selectCustomer(cnum: string) {
    setLookupError(null);
    try {
      const res = await fetch(`/api/por/customer?cnum=${encodeURIComponent(cnum)}`);
      const data = (await res.json()) as {
        history?: {
          customer: PorCustomerRecord;
          jobSites: PorJobSiteRecord[];
          comments: Array<{ comments: string }>;
        };
        error?: string;
      };
      if (!res.ok || !data.history) {
        throw new Error(data.error || "Could not load customer");
      }
      const c = data.history.customer;
      const comments = (data.history.comments || [])
        .map((x) => x.comments)
        .filter(Boolean)
        .join("\n");
      setSites(data.history.jobSites || []);
      set({
        customerCnum: c.cnum,
        customerName: c.name || customer.customerName,
        customerPhone: c.phone || c.mobile || customer.customerPhone,
        customerEmail: c.email || customer.customerEmail,
        customerAddress: [c.address, c.city, c.zip].filter(Boolean).join(", "),
        taxCode: c.taxCode || "",
        salesRep: c.salesman || customer.salesRep,
        customerComments: comments,
        jobSiteId: "",
        jobSiteLabel: "",
        jobSiteNotes: "",
        jobSiteDeliveryInstructions: "",
      });
      setHits([]);
    } catch (err) {
      setLookupError((err as Error).message);
    }
  }

  function selectSite(site: PorJobSiteRecord) {
    set({
      jobSiteId: site.number || site.description || "",
      jobSiteLabel: site.description || site.siteAddress || "Job site",
      deliveryAddress: [site.siteAddress, site.siteCity, site.siteZip]
        .filter(Boolean)
        .join(", "),
      venue: site.description || customer.venue,
      fulfillment: "delivery",
      jobSiteNotes: site.siteNotes || "",
      jobSiteDeliveryInstructions: site.siteDeliveryInstructions || "",
      deliveryNotes: site.siteDeliveryInstructions || customer.deliveryNotes,
    });
  }

  function onDeliveryDateTime(value: string) {
    const date = value.slice(0, 10);
    const time = value.length >= 16 ? value.slice(11, 16) : "";
    set({
      deliveryDateTime: value,
      eventDate: date || customer.eventDate,
      eventStartTime: time || customer.eventStartTime,
    });
  }

  return (
    <div className="pp-panel space-y-4 rounded-2xl p-5 lg:p-6">
      <p className="text-sm text-[var(--pp-text-muted)]">
        POR field destinations stay 1:1 — do not merge delivery and pickup notes.
        Delivery/pickup time lives on the datetime (no separate window column).
      </p>

      <div className="rounded-xl border border-[var(--pp-border)] p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
          POR customer
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void searchCustomers();
              }
            }}
            placeholder="Search name / phone / email"
            className="pp-input min-w-[220px] flex-1 px-3 py-2 text-sm"
          />
          <button
            type="button"
            className="pp-btn-secondary px-3 py-2 text-sm"
            onClick={() => void searchCustomers()}
          >
            Search
          </button>
        </div>
        {lookupError ? (
          <p className="mt-2 text-xs text-red-600">{lookupError}</p>
        ) : null}
        {hits.length > 0 ? (
          <ul className="mt-2 divide-y divide-[var(--pp-border)] text-sm">
            {hits.slice(0, 8).map((h) => (
              <li key={h.cnum}>
                <button
                  type="button"
                  className="w-full py-2 text-left text-[var(--pp-accent)] hover:underline"
                  onClick={() => void selectCustomer(h.cnum)}
                >
                  {h.name}{" "}
                  <span className="text-[var(--pp-text-muted)]">
                    {h.city || h.phone || h.cnum}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {customer.taxCode ? (
          <p className="mt-2 text-xs text-[var(--pp-text-muted)]">
            TaxCode {customer.taxCode}
            {customer.taxExemptNumber
              ? ` · exempt ${customer.taxExemptNumber}`
              : ""}
          </p>
        ) : null}
        {customer.customerComments ? (
          <p className="mt-2 whitespace-pre-wrap text-xs text-[var(--pp-text)]">
            <span className="font-semibold text-[var(--pp-text-muted)]">
              CustomerComments (read-only):{" "}
            </span>
            {customer.customerComments}
          </p>
        ) : null}
      </div>

      {sites.length > 0 ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
            Saved job sites
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sites.map((site) => (
              <button
                key={`${site.number}-${site.description}`}
                type="button"
                className={`rounded-xl border px-3 py-2 text-left text-xs ${
                  customer.jobSiteId === (site.number || site.description)
                    ? "border-[var(--pp-accent)] bg-[var(--pp-accent-soft)]"
                    : "border-[var(--pp-border)]"
                }`}
                onClick={() => selectSite(site)}
              >
                <span className="font-semibold text-[var(--pp-text)]">
                  {site.description || site.siteAddress || "Job site"}
                </span>
                <span className="mt-0.5 block text-[var(--pp-text-muted)]">
                  {[site.siteCity, site.contactName].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
          {customer.jobSiteNotes ? (
            <p className="mt-2 text-xs text-[var(--pp-text-muted)]">
              SiteNotes (read-only): {customer.jobSiteNotes}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="DeliveryDate" hint="(datetime → POR DeliveryDate)">
          <input
            type="datetime-local"
            value={customer.deliveryDateTime || ""}
            onChange={(e) => onDeliveryDateTime(e.target.value)}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="PickupDate" hint="(datetime → POR PickupDate)">
          <input
            type="datetime-local"
            value={customer.pickupDateTime || ""}
            onChange={(e) => set({ pickupDateTime: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="Event date" hint="(availability)">
          <input
            type="date"
            value={customer.eventDate}
            onChange={(e) => set({ eventDate: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="Salesman">
          {salesmen.length > 0 ? (
            <select
              value={customer.salesmanId || customer.salesRep || ""}
              onChange={(e) => {
                const row = salesmen.find(
                  (s) => s.id === e.target.value || s.name === e.target.value,
                );
                set({
                  salesmanId: row?.id || e.target.value,
                  salesRep: row?.name || e.target.value,
                });
              }}
              className="pp-input w-full px-3 py-2.5 text-sm"
            >
              <option value="">—</option>
              {salesmen.map((s) => (
                <option key={s.id || s.name} value={s.id || s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={customer.salesRep || ""}
              onChange={(e) => set({ salesRep: e.target.value })}
              className="pp-input w-full px-3 py-2.5 text-sm"
              placeholder="POR Salesman list not synced yet"
            />
          )}
        </Field>
        <Field label="Customer name">
          <input
            value={customer.customerName}
            onChange={(e) => set({ customerName: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="Phone">
          <input
            value={customer.customerPhone}
            onChange={(e) => set({ customerPhone: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={customer.customerEmail}
            onChange={(e) => set({ customerEmail: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="Guest count">
          <input
            value={customer.guestCount || ""}
            onChange={(e) => set({ guestCount: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="Theme / colors">
          <input
            value={customer.themeColors || ""}
            onChange={(e) => set({ themeColors: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="Venue">
          <input
            value={customer.venue || ""}
            onChange={(e) => set({ venue: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="TaxCode">
          <input
            value={customer.taxCode || ""}
            onChange={(e) => set({ taxCode: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
            placeholder="From customer record"
          />
        </Field>
        <Field label="TaxExemptNumber">
          <input
            value={customer.taxExemptNumber || ""}
            onChange={(e) => set({ taxExemptNumber: e.target.value })}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={customer.fulfillment === "pickup"}
            onChange={() => set({ fulfillment: "pickup" })}
          />
          Customer pick-up
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={customer.fulfillment === "delivery"}
            onChange={() => set({ fulfillment: "delivery" })}
          />
          Delivery
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={customer.applyDamageWaiver !== false}
            onChange={(e) => set({ applyDamageWaiver: e.target.checked })}
          />
          Ask damage waiver (5% of RENT)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={customer.damageWaiverExempt === true}
            onChange={(e) => set({ damageWaiverExempt: e.target.checked })}
          />
          DamageWaiverExempt
        </label>
      </div>

      {customer.fulfillment === "delivery" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Delivery address">
            <input
              value={customer.deliveryAddress || ""}
              onChange={(e) => set({ deliveryAddress: e.target.value })}
              className="pp-input w-full px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="Location type">
            <select
              value={customer.locationType || ""}
              onChange={(e) => set({ locationType: e.target.value })}
              className="pp-input w-full px-3 py-2.5 text-sm"
            >
              <option value="">—</option>
              <option>House</option>
              <option>Carport/Garage</option>
              <option>Backyard</option>
              <option>Steps/Stairs</option>
              <option>Hotel/Banquet Room</option>
              <option>Other</option>
            </select>
          </Field>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <Field label="Transactions.Notes">
          <textarea
            value={customer.transactionNotes || customer.notes || ""}
            onChange={(e) => set({ transactionNotes: e.target.value, notes: e.target.value })}
            rows={2}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="DeliveryNotes">
          <textarea
            value={customer.deliveryNotes || ""}
            onChange={(e) => set({ deliveryNotes: e.target.value })}
            rows={2}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="PickupNotes">
          <textarea
            value={customer.pickupNotes || ""}
            onChange={(e) => set({ pickupNotes: e.target.value })}
            rows={2}
            className="pp-input w-full px-3 py-2.5 text-sm"
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="pp-btn-secondary px-4 py-2.5 text-sm"
          onClick={onBack}
        >
          Back
        </button>
        <button
          type="button"
          disabled={busy}
          className="pp-btn-primary px-5 py-2.5 text-sm"
          onClick={onNext}
        >
          {busy ? "Building quote…" : "Build quote →"}
        </button>
      </div>
    </div>
  );
}
