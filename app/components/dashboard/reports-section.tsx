"use client";

import { PageHeader } from "@/app/components/dashboard/page-header";
import type { SavedReport } from "@/lib/types";
import { formatTime } from "@/lib/ui";
import { useState } from "react";

export function ReportsSection({
  reports,
  onGenerateRecap,
  onSendSmsRecap,
  isOwner,
}: {
  reports: SavedReport[];
  onGenerateRecap: () => Promise<SavedReport>;
  onSendSmsRecap?: () => Promise<void>;
  isOwner: boolean;
}) {
  const [loading, setLoading] = useState<"generate" | "sms" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    reports[0]?.id ?? null,
  );

  const selected =
    reports.find((report) => report.id === selectedId) ?? reports[0] ?? null;

  async function handleGenerate() {
    setLoading("generate");
    setError(null);
    setFeedback(null);
    try {
      const report = await onGenerateRecap();
      setSelectedId(report.id);
      setFeedback("New weekly recap saved.");
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Failed to generate report.",
      );
    } finally {
      setLoading(null);
    }
  }

  async function handleSendSms() {
    if (!onSendSmsRecap) return;
    setLoading("sms");
    setError(null);
    setFeedback(null);
    try {
      await onSendSmsRecap();
      setFeedback("Recap sent via SMS and saved to Reports.");
    } catch (smsError) {
      setError(
        smsError instanceof Error ? smsError.message : "Failed to send SMS.",
      );
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Intelligence"
        title="Reports"
        description="Saved weekly recaps from Mike — Operations Manager. Generate, review, and SMS to management."
        action={
          isOwner ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loading !== null}
                onClick={() => void handleGenerate()}
                className="pp-btn-secondary px-4 py-2 text-xs"
              >
                {loading === "generate" ? "Generating…" : "Generate recap"}
              </button>
              {onSendSmsRecap && (
                <button
                  type="button"
                  disabled={loading !== null}
                  onClick={() => void handleSendSms()}
                  className="pp-btn-primary px-4 py-2 text-xs"
                >
                  {loading === "sms" ? "Sending…" : "Generate & Send Weekly Recap"}
                </button>
              )}
            </div>
          ) : undefined
        }
      />

      {feedback && (
        <p className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
          {feedback}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <section
          className={`pp-panel p-4 ${selectedId ? "hidden xl:block" : ""}`}
        >
          <h3 className="mb-3 text-sm font-semibold text-[var(--pp-text)]">
            Saved reports
          </h3>
          <div className="space-y-2">
            {reports.length === 0 ? (
              <p className="text-sm text-[var(--pp-text-muted)]">
                No reports yet. Generate a weekly recap to get started.
              </p>
            ) : (
              reports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setSelectedId(report.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    selected?.id === report.id
                      ? "border-[var(--pp-accent)] bg-[var(--pp-accent-soft)]"
                      : "border-[var(--pp-border)] hover:border-[var(--pp-accent)]/40"
                  }`}
                >
                  <p className="text-sm font-medium text-[var(--pp-text)]">
                    {report.title}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--pp-text-muted)]">
                    {formatTime(report.generatedAt)}
                    {report.sentViaSms && " · Sent via SMS"}
                  </p>
                </button>
              ))
            )}
          </div>
        </section>

        <section
          className={`pp-panel min-h-[240px] p-4 sm:p-6 xl:min-h-[420px] ${
            !selectedId ? "hidden xl:block" : ""
          }`}
        >
          {selected ? (
            <>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="mb-3 flex min-h-11 items-center gap-2 rounded-xl border border-[var(--pp-border)] px-3 text-sm font-medium text-[var(--pp-text)] xl:hidden"
              >
                ← Back to reports
              </button>
              <div className="border-b border-[var(--pp-border)] pb-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider pp-accent-text">
                  {selected.type.replace("-", " ")}
                </p>
                <h3 className="mt-1 text-xl font-semibold text-[var(--pp-text)]">
                  {selected.title}
                </h3>
                <p className="mt-2 text-xs text-[var(--pp-text-muted)]">
                  Generated {formatTime(selected.generatedAt)} by{" "}
                  {selected.generatedBy === "mike-operations"
                    ? "Mike - Operations Manager"
                    : "System"}
                  {selected.twilioSid && (
                    <span className="ml-2">· Twilio {selected.twilioSid.slice(-8)}</span>
                  )}
                </p>
              </div>
              <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-7 text-[var(--pp-text)]">
                {selected.content}
              </pre>
            </>
          ) : (
            <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-[var(--pp-text-muted)] xl:min-h-[320px]">
              Select a report or generate a new weekly recap.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
