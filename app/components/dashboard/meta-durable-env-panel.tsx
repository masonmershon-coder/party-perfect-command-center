"use client";

import type { MetaConnectionInfo } from "@/lib/social-accounts";
import { useState } from "react";

/** After Meta connect — remind owner to push secrets to Vercel (durable). */
export function MetaDurableEnvPanel({
  connection,
}: {
  connection: MetaConnectionInfo;
}) {
  const [copied, setCopied] = useState(false);
  const rows = connection.durableEnv?.rows ?? [];
  const readyCount = rows.filter((row) => row.present).length;

  if (!connection.canSync) return null;

  async function copyChecklist() {
    const lines = [
      "# Push to Vercel Production, then redeploy",
      connection.durableEnv?.pushCommand || "node scripts/push-meta-env-vercel.mjs",
      "",
      ...rows.map(
        (row) =>
          `${row.key}=${row.present ? row.masked || "(set)" : "(missing)"}`,
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="pp-panel mb-6 rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] pp-accent-text">
            Keep Madison durable on Vercel
          </p>
          <p className="mt-1 max-w-2xl text-sm text-[var(--pp-text-muted)]">
            Serverless /tmp can drop OAuth tokens. {readyCount}/{rows.length}{" "}
            keys ready — push Production env, then redeploy.
          </p>
          <p className="mt-2 font-mono text-[11px] text-[var(--pp-text)]">
            {connection.durableEnv?.pushCommand}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copyChecklist()}
          className="rounded-xl border border-[var(--pp-border)] px-3 py-2 text-xs font-medium text-[var(--pp-text)] transition hover:border-[var(--pp-accent)]"
        >
          {copied ? "Copied" : "Copy checklist"}
        </button>
      </div>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-center justify-between gap-2 rounded-lg border border-[var(--pp-border)] px-2.5 py-1.5 text-[11px]"
          >
            <span className="font-mono text-[var(--pp-text)]">{row.key}</span>
            <span
              className={
                row.present
                  ? "text-emerald-700"
                  : "text-[var(--pp-text-muted)]"
              }
            >
              {row.present ? row.masked || "set" : "missing"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
