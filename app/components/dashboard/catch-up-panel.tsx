"use client";

import type { CatchUpItem, CatchUpResult } from "@/lib/types";
import { formatTime } from "@/lib/ui";
import { useState } from "react";

export function CatchUpPanel({
  onOpenItem,
  variant = "dashboard",
}: {
  onOpenItem: (item: CatchUpItem, draftReply: boolean) => void;
  variant?: "dashboard" | "social";
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CatchUpResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function runCatchUp() {
    setLoading(true);
    setError(null);
    setExpanded(true);

    try {
      const response = await fetch("/api/catch-up", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Catch up failed.",
        );
      }
      setResult(payload as CatchUpResult);
    } catch (catchUpError) {
      setError(
        catchUpError instanceof Error
          ? catchUpError.message
          : "Catch up failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`${
        variant === "dashboard" ? "mt-8" : "mb-6"
      } overflow-hidden rounded-2xl border border-[var(--pp-accent)]/30 bg-gradient-to-br from-[var(--pp-accent-soft)] to-[var(--pp-panel)]`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] pp-accent-text">
            Grok Catch Up
          </p>
          <h3 className="mt-1 text-lg font-semibold text-[var(--pp-text)]">
            Clear your inbox & social queue
          </h3>
          <p className="mt-1 max-w-xl text-sm text-[var(--pp-text-muted)]">
            Analyzes unreplied emails (3 accounts) and Facebook/Instagram
            comments from the last 6 months.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void runCatchUp()}
          className="rounded-2xl bg-[var(--pp-accent)] px-8 py-4 text-base font-semibold text-white shadow-lg transition hover:opacity-95 disabled:opacity-60"
        >
          {loading ? "Analyzing with Grok…" : "Catch Up"}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-[var(--pp-border)] bg-[var(--pp-panel)] p-6">
          {loading && (
            <p className="text-sm text-[var(--pp-text-muted)]">
              Grok is reviewing outstanding emails and social comments…
            </p>
          )}

          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
              {error}
            </p>
          )}

          {result && !loading && (
            <div>
              <p className="text-2xl font-semibold pp-accent-text">
                {result.summary}
              </p>
              <p className="mt-1 text-sm text-[var(--pp-text-muted)]">
                Last 6 months · {result.emailCount} email
                {result.emailCount === 1 ? "" : "s"} · {result.socialCount}{" "}
                social comment{result.socialCount === 1 ? "" : "s"}
              </p>

              <div className="pp-panel mt-4 rounded-xl p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] pp-accent-text">
                  Grok analysis
                </p>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6 text-[var(--pp-text)]">
                  {result.grokInsights}
                </pre>
              </div>

              {result.items.length > 0 ? (
                <div className="mt-6 space-y-3">
                  <p className="text-sm font-semibold text-[var(--pp-text)]">
                    Priority queue
                  </p>
                  {result.items.map((item, index) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--pp-accent)] text-[11px] font-bold text-white">
                            {index + 1}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              item.priority === "high"
                                ? "bg-red-500/10 text-red-600"
                                : item.priority === "medium"
                                  ? "bg-[var(--pp-accent-soft)] pp-accent-text"
                                  : "bg-[var(--pp-accent-muted)] text-[var(--pp-text-muted)]"
                            }`}
                          >
                            {item.priority}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider text-[var(--pp-text-muted)]">
                            {item.type === "email" ? "Email" : "Social"} ·{" "}
                            {item.source}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-medium text-[var(--pp-text)]">
                          {item.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-[var(--pp-text-muted)]">
                          {item.preview}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--pp-text-muted)]">
                          {formatTime(item.date)}
                          {item.grokNote && (
                            <span className="ml-2 text-emerald-600">
                              · {item.grokNote}
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenItem(item, true)}
                        className="min-h-11 w-full shrink-0 rounded-xl bg-[var(--pp-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 sm:w-auto sm:text-xs"
                      >
                        Open & draft reply
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-emerald-600">
                  ✓ Nothing outstanding — you&apos;re caught up!
                </p>
              )}

              <p className="mt-6 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-accent-muted)]/50 px-4 py-3 text-xs leading-5 text-[var(--pp-text-muted)]">
                <strong className="text-[var(--pp-text)]">Note:</strong> Live
                Meta (Facebook/Instagram) and GoDaddy email API integration will
                connect later for automatic send and sync. For now, Catch Up
                uses your Command Center inbox and copies drafts for you to
                paste.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
