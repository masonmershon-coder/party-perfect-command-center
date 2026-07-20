"use client";

import { PageHeader } from "@/app/components/dashboard/page-header";
import { StatusBadge } from "@/app/components/status-badge";
import type { MarketingItem } from "@/lib/types";
import { formatTime, marketingStatusStyles } from "@/lib/ui";

export function MarketingSection({
  marketing,
}: {
  marketing: MarketingItem[];
}) {
  const googleAds = marketing.filter((item) => item.channel === "Google Ads");
  const campaigns = marketing.filter((item) => item.channel !== "Google Ads");

  return (
    <div>
      <PageHeader
        eyebrow="Growth"
        title="Marketing / Google Ads"
        description="Campaign drafts, seasonal promos, and Google Ads planning for Party Perfect Event Rentals in Tulsa."
      />

      <div className="pp-panel mb-6 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
          Google Ads — Coming Soon
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--pp-text-muted)]">
          Live Google Ads integration will connect here for spend, clicks, and
          conversion tracking. For now, use the placeholder campaigns below and
          coordinate with Madison for ad copy that matches your social voice.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Monthly budget", value: "—" },
            { label: "Active campaigns", value: String(googleAds.length) },
            { label: "API status", value: "Placeholder" },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-4 py-3"
            >
              <p className="text-[10px] uppercase tracking-wider text-[var(--pp-text-muted)]">
                {card.label}
              </p>
              <p className="mt-1 text-lg font-semibold pp-accent-text">
                {card.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {campaigns.map((item) => (
          <article
            key={item.id}
            className="pp-panel rounded-2xl p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider pp-accent-text">
                  {item.channel}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[var(--pp-text)]">
                  {item.title}
                </h3>
              </div>
              <span className={marketingStatusStyles[item.status]}>
                {item.status}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--pp-text-muted)]">
              {item.content}
            </p>
            <p className="mt-3 text-[11px] text-[var(--pp-text-muted)]">
              Updated {formatTime(item.updatedAt)}
              {item.scheduledDate && ` · Scheduled ${item.scheduledDate}`}
            </p>
          </article>
        ))}
      </div>

      {googleAds.length > 0 && (
        <section className="mt-8">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider pp-accent-text">
            Google Ads drafts
          </h3>
          <div className="space-y-3">
            {googleAds.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-dashed border-amber-500/30 bg-[var(--pp-panel)] p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-medium text-[var(--pp-text)]">
                    {item.title}
                  </h4>
                  <StatusBadge status={item.status} kind="marketing" />
                </div>
                <p className="mt-2 text-sm text-[var(--pp-text-muted)]">
                  {item.content}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
