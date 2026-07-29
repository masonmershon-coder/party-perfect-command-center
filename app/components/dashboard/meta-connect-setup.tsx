"use client";

import { saveMetaAppCredentials } from "@/lib/client-api";
import type { MetaConnectionInfo } from "@/lib/social-accounts";
import { useState } from "react";

export function MetaConnectSetup({
  connection,
  onSaved,
}: {
  connection: MetaConnectionInfo;
  onSaved: () => Promise<void>;
}) {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readyForConnect =
    connection.appIdConfigured && connection.appSecretConfigured;
  const oauthUrl = connection.oauthUrl ?? null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await saveMetaAppCredentials({ appId, appSecret });
      setMessage(result.message);
      setAppSecret("");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save credentials.");
    } finally {
      setSaving(false);
    }
  }

  if (connection.canSync) {
    return (
      <>
        <div className="pp-panel mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Meta connected · Madison live
            </p>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
              FB{connection.instagramConfigured ? "+IG" : ""}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--pp-text)]">
            {connection.pageName || "Facebook Page"}
            {connection.instagramUsername
              ? ` · ${connection.instagramUsername}`
              : ""}
          </p>
          <p className="mt-1 text-xs text-[var(--pp-text-muted)]">
            {connection.message}
          </p>
        </div>
      </>
    );
  }

  return (
    <div className="pp-panel mb-6 rounded-2xl border border-[var(--pp-accent)]/25 bg-[var(--pp-accent-soft)]/30 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] pp-accent-text">
        Connect Facebook + Instagram
      </p>
      <h3 className="mt-2 text-lg font-semibold text-[var(--pp-text)]">
        Mike will finish the hard parts
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--pp-text-muted)]">
        {connection.message}
      </p>

      <ol className="mt-4 space-y-2 text-sm text-[var(--pp-text)]">
        <li>
          <span className="font-semibold pp-accent-text">1.</span> Open{" "}
          <a
            href="https://developers.facebook.com/apps/"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[var(--pp-accent)] underline-offset-2"
          >
            developers.facebook.com/apps
          </a>{" "}
          → Create app → choose <strong>Business</strong> → name it Party Perfect.
        </li>
        <li>
          <span className="font-semibold pp-accent-text">2.</span> Copy{" "}
          <strong>App ID</strong> and <strong>App Secret</strong> from App settings
          → Basic, paste below, Save.
        </li>
        <li>
          <span className="font-semibold pp-accent-text">3.</span> In Meta app →
          Facebook Login → Settings, add this Redirect URI:
          <code className="mt-1 block break-all rounded-lg bg-[var(--pp-accent-muted)] px-3 py-2 text-xs">
            {connection.oauthRedirectUri}
          </code>
        </li>
        <li>
          <span className="font-semibold pp-accent-text">4.</span> Click{" "}
          <strong>Connect with Facebook</strong>, log in as the Page admin, click
          Allow. Mike grabs Page token + Instagram automatically.
        </li>
      </ol>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
          App ID
          <input
            value={appId}
            onChange={(event) => setAppId(event.target.value)}
            placeholder={connection.appIdConfigured ? "Saved ✓ — paste to replace" : "1234567890"}
            className="pp-input mt-1.5 w-full px-3 py-2.5 text-sm normal-case tracking-normal"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
          App Secret
          <input
            type="password"
            value={appSecret}
            onChange={(event) => setAppSecret(event.target.value)}
            placeholder={
              connection.appSecretConfigured ? "Saved ✓ — paste to replace" : "••••••••"
            }
            className="pp-input mt-1.5 w-full px-3 py-2.5 text-sm normal-case tracking-normal"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || !appId.trim() || !appSecret.trim()}
          onClick={() => void handleSave()}
          className="rounded-xl border border-[var(--pp-border)] px-4 py-2.5 text-sm font-medium text-[var(--pp-text)] transition hover:border-[var(--pp-accent)] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save App ID + Secret"}
        </button>
        <a
          href={readyForConnect && oauthUrl ? oauthUrl : undefined}
          aria-disabled={!readyForConnect || !oauthUrl}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition ${
            readyForConnect && oauthUrl
              ? "bg-[var(--pp-accent)] hover:opacity-95"
              : "cursor-not-allowed bg-[var(--pp-text-muted)]/40"
          }`}
          onClick={(event) => {
            if (!readyForConnect || !oauthUrl) event.preventDefault();
          }}
        >
          Connect with Facebook
        </a>
      </div>

      {message && (
        <p className="mt-3 text-sm text-emerald-700">{message}</p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
