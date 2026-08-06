"use client";

import { PageHeader } from "@/app/components/dashboard/page-header";
import { StatusBadge } from "@/app/components/status-badge";
import {
  fetchGoogleAdsSetup,
  saveGoogleAdsSetup,
  syncGoogleAds,
  type GoogleAdsSetupPayload,
} from "@/lib/client-api";
import type { MarketingItem } from "@/lib/types";
import { formatTime, marketingStatusStyles } from "@/lib/ui";
import { useCallback, useEffect, useState } from "react";

export function MarketingSection({
  marketing,
}: {
  marketing: MarketingItem[];
}) {
  const googleAds = marketing.filter((item) => item.channel === "Google Ads");
  const campaigns = marketing.filter((item) => item.channel !== "Google Ads");

  const [setup, setSetup] = useState<GoogleAdsSetupPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [accountEmail, setAccountEmail] = useState(
    "Partyperfectok@gmail.com",
  );
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [developerToken, setDeveloperToken] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [loginCustomerId, setLoginCustomerId] = useState("");
  const [monthlyBudgetUsd, setMonthlyBudgetUsd] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGoogleAdsSetup();
      setSetup(data);
      if (data.status.accountEmail) setAccountEmail(data.status.accountEmail);
      if (data.status.monthlyBudgetUsd != null) {
        setMonthlyBudgetUsd(String(data.status.monthlyBudgetUsd));
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load Google Ads setup.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("googleAds") === "connected") {
      setMessage("Google connected. Add developer token + customer ID if still missing, then Sync.");
      void refresh();
    }
    if (params.get("googleAds") === "error") {
      setError(params.get("detail") || "Google OAuth failed.");
    }
  }, [refresh]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await saveGoogleAdsSetup({
        accountEmail,
        clientId: clientId || undefined,
        clientSecret: clientSecret || undefined,
        developerToken: developerToken || undefined,
        customerId: customerId || undefined,
        loginCustomerId: loginCustomerId || undefined,
        monthlyBudgetUsd: monthlyBudgetUsd || undefined,
      });
      setMessage(result.message);
      setClientSecret("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await syncGoogleAds();
      setMessage(result.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  const status = setup?.status;
  const snapshot = setup?.snapshot;
  const live = Boolean(status?.canSync && snapshot);

  return (
    <div>
      <PageHeader
        eyebrow="Growth"
        title="Marketing / Google Ads"
        description="Mike manages Tulsa Google Ads keywords and budget once Ads API is connected. OAuth only — never paste Google passwords."
      />

      <div
        className={`pp-panel mb-6 rounded-2xl border p-5 ${
          live
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-amber-500/25 bg-amber-500/5"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={`text-xs font-semibold uppercase tracking-[0.16em] ${
              live ? "text-emerald-700" : "text-amber-700"
            }`}
          >
            {live ? "Google Ads · Live for Mike" : "Google Ads · Connect"}
          </p>
          {status?.accountEmail && (
            <span className="rounded-full bg-[var(--pp-accent-muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--pp-text-muted)]">
              {status.accountEmail}
            </span>
          )}
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--pp-text-muted)]">
          {loading
            ? "Loading setup…"
            : status?.message ||
              "Save OAuth + Ads IDs, connect as Partyperfectok@gmail.com, then sync for keywords."}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            {
              label: "Monthly budget",
              value:
                status?.monthlyBudgetUsd != null
                  ? `$${status.monthlyBudgetUsd}`
                  : "—",
            },
            {
              label: "30d spend (synced)",
              value: snapshot
                ? `$${snapshot.totals.costUsd.toFixed(2)}`
                : "—",
            },
            {
              label: "API",
              value: live
                ? "Live"
                : status?.hasRefreshToken
                  ? "OAuth ✓"
                  : "Not live",
            },
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

        {message && (
          <p className="mt-3 text-sm text-emerald-700">{message}</p>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
            Google login email (label)
            <input
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              className="pp-input mt-1.5 w-full px-3 py-2.5 text-sm normal-case tracking-normal"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
            Monthly budget (USD)
            <input
              value={monthlyBudgetUsd}
              onChange={(e) => setMonthlyBudgetUsd(e.target.value)}
              placeholder="e.g. 500"
              className="pp-input mt-1.5 w-full px-3 py-2.5 text-sm normal-case tracking-normal"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
            OAuth Client ID
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder={
                status?.hasClientId ? "Saved ✓ — paste to replace" : "….apps.googleusercontent.com"
              }
              className="pp-input mt-1.5 w-full px-3 py-2.5 text-sm normal-case tracking-normal"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
            OAuth Client Secret
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={
                status?.hasClientSecret
                  ? "Saved ✓ — paste to replace"
                  : "••••••••"
              }
              className="pp-input mt-1.5 w-full px-3 py-2.5 text-sm normal-case tracking-normal"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
            Google Ads Developer Token
            <input
              value={developerToken}
              onChange={(e) => setDeveloperToken(e.target.value)}
              placeholder={
                status?.hasDeveloperToken
                  ? "Saved ✓ — paste to replace"
                  : "From Ads → Tools → API Center"
              }
              className="pp-input mt-1.5 w-full px-3 py-2.5 text-sm normal-case tracking-normal"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
            Customer ID (xxx-xxx-xxxx)
            <input
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder={
                status?.customerId
                  ? `Saved ${status.customerId}`
                  : "From top of Google Ads"
              }
              className="pp-input mt-1.5 w-full px-3 py-2.5 text-sm normal-case tracking-normal"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--pp-text-muted)] md:col-span-2">
            Login customer ID (MCC only, optional)
            <input
              value={loginCustomerId}
              onChange={(e) => setLoginCustomerId(e.target.value)}
              placeholder="Only if using a manager account"
              className="pp-input mt-1.5 w-full px-3 py-2.5 text-sm normal-case tracking-normal"
            />
          </label>
        </div>

        {setup?.redirectUri && (
          <p className="mt-3 text-xs text-[var(--pp-text-muted)]">
            Google Cloud OAuth redirect URI (exact):
            <code className="mt-1 block break-all rounded-lg bg-[var(--pp-accent-muted)] px-3 py-2 text-[11px]">
              {setup.redirectUri}
            </code>
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void handleSave()}
            className="rounded-xl border border-[var(--pp-border)] px-4 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
          <a
            href={
              status?.canConnectOAuth && setup?.oauthUrl
                ? setup.oauthUrl
                : undefined
            }
            aria-disabled={!status?.canConnectOAuth || !setup?.oauthUrl}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${
              status?.canConnectOAuth && setup?.oauthUrl
                ? "bg-[var(--pp-accent)]"
                : "cursor-not-allowed bg-[var(--pp-text-muted)]/40"
            }`}
            onClick={(e) => {
              if (!status?.canConnectOAuth || !setup?.oauthUrl) e.preventDefault();
            }}
          >
            Connect with Google
          </a>
          <button
            type="button"
            disabled={syncing || !status?.hasRefreshToken}
            onClick={() => void handleSync()}
            className="rounded-xl border border-emerald-600/40 px-4 py-2.5 text-sm font-semibold text-emerald-800 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync campaigns & keywords"}
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-5 text-[var(--pp-text-muted)]">
          Password note: Google blocks apps from saving your Gmail password.
          Use Connect with Google after OAuth Client ID/Secret. Developer token
          is required before Mike sees live keyword spend.
        </p>
      </div>

      {snapshot && (
        <section className="mb-8 grid gap-4 lg:grid-cols-2">
          <div className="pp-panel rounded-2xl p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider pp-accent-text">
              Campaigns (30d)
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              {snapshot.campaigns.slice(0, 12).map((c) => (
                <li
                  key={c.id || c.name}
                  className="flex justify-between gap-2 border-b border-[var(--pp-border)] pb-2"
                >
                  <span className="text-[var(--pp-text)]">{c.name}</span>
                  <span className="shrink-0 text-[var(--pp-text-muted)]">
                    ${(c.costMicros / 1_000_000).toFixed(0)} · {c.clicks} clk
                  </span>
                </li>
              ))}
              {snapshot.campaigns.length === 0 && (
                <li className="text-[var(--pp-text-muted)]">No campaigns yet.</li>
              )}
            </ul>
          </div>
          <div className="pp-panel rounded-2xl p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider pp-accent-text">
              Keywords (top impressions)
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              {snapshot.keywords.slice(0, 15).map((k) => (
                <li
                  key={`${k.text}-${k.adGroup}`}
                  className="flex justify-between gap-2 border-b border-[var(--pp-border)] pb-2"
                >
                  <span className="text-[var(--pp-text)]">
                    {k.text}{" "}
                    <span className="text-[10px] text-[var(--pp-text-muted)]">
                      {k.matchType}
                    </span>
                  </span>
                  <span className="shrink-0 text-[var(--pp-text-muted)]">
                    {k.impressions} imp
                  </span>
                </li>
              ))}
              {snapshot.keywords.length === 0 && (
                <li className="text-[var(--pp-text-muted)]">No keywords yet.</li>
              )}
            </ul>
            <p className="mt-2 text-[10px] text-[var(--pp-text-muted)]">
              Synced {formatTime(snapshot.syncedAt)}
            </p>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {campaigns.map((item) => (
          <article key={item.id} className="pp-panel rounded-2xl p-5">
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
