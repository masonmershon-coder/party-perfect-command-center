"use client";

import { PageHeader } from "@/app/components/dashboard/page-header";
import type { JobApplication } from "@/lib/jobs";
import { JOB_ROLES, roleLabel } from "@/lib/jobs";
import { formatTime } from "@/lib/ui";
import { useEffect, useMemo, useState } from "react";

type FilterMode = "all" | "flagged" | "license";

export function HiringSection({
  applications,
  total,
  flaggedForJosh,
  storeMode,
  onRefresh,
  onDelete,
  loading = false,
}: {
  applications: JobApplication[];
  total: number;
  flaggedForJosh: number;
  storeMode?: "redis" | "blob" | "ephemeral" | "local";
  onRefresh: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  loading?: boolean;
}) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    applications[0]?.id ?? null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (
      selectedId &&
      !applications.some((app) => app.id === selectedId) &&
      applications[0]
    ) {
      setSelectedId(applications[0].id);
    }
  }, [applications, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return applications.filter((app) => {
      if (filter === "flagged" && !app.mike.flagForJosh) return false;
      if (filter === "license" && app.validDriverLicense !== "yes") return false;
      if (roleFilter !== "all" && !app.roles.includes(roleFilter as never)) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        app.fullName,
        app.email,
        app.phone,
        app.city,
        app.mike.primaryFit,
        app.mike.summary,
        ...app.roles.map(roleLabel),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [applications, filter, roleFilter, query]);

  const selected =
    filtered.find((app) => app.id === selectedId) ?? filtered[0] ?? null;

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      await onRefresh();
      setFeedback("Candidate list refreshed.");
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not refresh.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    const ok = window.confirm(
      `Delete application for ${selected.fullName}? This cannot be undone.`,
    );
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(selected.id);
      setFeedback(`Deleted ${selected.fullName}.`);
      setSelectedId(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete application.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Hiring"
        title="Candidates"
        description="Mike scores every PartyPerfectJobs application automatically. Scores 70+ are flagged for Josh and SMS’d. Review, filter, reach out, or delete here."
        action={
          <button
            type="button"
            disabled={refreshing || loading}
            onClick={() => void handleRefresh()}
            className="pp-btn-secondary px-4 py-2 text-xs"
          >
            {refreshing || loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      {storeMode === "ephemeral" && (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          Candidate storage is temporary on this server. Link Upstash Redis in
          Vercel Storage so applications survive deploys — see docs/JOBS_DNS.md.
        </p>
      )}
      {storeMode === "blob" && (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          Hiring is still on Vercel Blob. Connect Upstash Redis (free) so we
          never lose applicants — see docs/JOBS_DNS.md.
        </p>
      )}
      {storeMode === "redis" && (
        <p className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
          Applications are saved in Redis and emailed to Josh/Rentals on every
          submit. Same list as PartyPerfectJobs — no manual transfer.
        </p>
      )}

      {feedback && (
        <p className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
          {feedback}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="pp-panel rounded-2xl px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
            Total apps
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--pp-text)]">
            {total}
          </p>
        </div>
        <div className="pp-panel rounded-2xl px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
            Flagged for Josh
          </p>
          <p className="mt-1 text-2xl font-semibold pp-accent-text">
            {flaggedForJosh}
          </p>
        </div>
        <div className="pp-panel rounded-2xl px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
            Showing
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--pp-text)]">
            {filtered.length}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, phone, email…"
          className="pp-input min-w-[220px] flex-1 rounded-xl px-3 py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
            filter === "all"
              ? "bg-[var(--pp-accent)] text-white"
              : "border border-[var(--pp-border)] text-[var(--pp-text-muted)]"
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setFilter("flagged")}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
            filter === "flagged"
              ? "bg-[var(--pp-accent)] text-white"
              : "border border-[var(--pp-border)] text-[var(--pp-text-muted)]"
          }`}
        >
          Top for Josh
        </button>
        <button
          type="button"
          onClick={() => setFilter("license")}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
            filter === "license"
              ? "bg-[var(--pp-accent)] text-white"
              : "border border-[var(--pp-border)] text-[var(--pp-text-muted)]"
          }`}
        >
          Has license
        </button>
        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          className="pp-input rounded-xl px-3 py-1.5 text-xs"
        >
          <option value="all">All roles</option>
          {JOB_ROLES.map((role) => (
            <option key={role.id} value={role.id}>
              {role.label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="pp-panel rounded-2xl p-8 text-center">
          <p className="text-sm font-semibold text-[var(--pp-text)]">
            No applications yet
          </p>
          <p className="mt-2 text-sm text-[var(--pp-text-muted)]">
            When someone applies on PartyPerfectJobs, Mike scores them here
            automatically.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-2">
            {filtered.map((app) => {
              const active = selected?.id === app.id;
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => setSelectedId(app.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-[var(--pp-accent)] bg-[var(--pp-accent-soft)]/50"
                      : "border-[var(--pp-border)] bg-[var(--pp-panel)] hover:border-[var(--pp-accent)]/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--pp-text)]">
                        {app.fullName}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--pp-text-muted)]">
                        {app.mike.primaryFit} · {app.city || "Tulsa area"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold pp-accent-text">
                        {app.mike.score}
                      </p>
                      {app.mike.flagForJosh && (
                        <span className="mt-0.5 inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                          Josh
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-[var(--pp-text-muted)]">
                    {formatTime(app.submittedAt)} ·{" "}
                    {app.roles.map(roleLabel).join(", ")}
                  </p>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="pp-panel rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] pp-accent-text">
                    Mike review
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-[var(--pp-text)]">
                    {selected.fullName}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--pp-text-muted)]">
                    {selected.email} · {selected.phone}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--pp-accent)]/30 bg-[var(--pp-accent-soft)]/40 px-4 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--pp-text-muted)]">
                    Score
                  </p>
                  <p className="text-3xl font-semibold pp-accent-text">
                    {selected.mike.score}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={`tel:${selected.phone.replace(/[^\d+]/g, "")}`}
                  className="pp-btn-primary px-3 py-2 text-xs"
                >
                  Call
                </a>
                <a
                  href={`sms:${selected.phone.replace(/[^\d+]/g, "")}`}
                  className="pp-btn-secondary px-3 py-2 text-xs"
                >
                  Text
                </a>
                <a
                  href={`mailto:${encodeURIComponent(selected.email)}?subject=${encodeURIComponent(`Party Perfect hiring — ${selected.fullName}`)}`}
                  className="pp-btn-secondary px-3 py-2 text-xs"
                >
                  Email
                </a>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void handleDelete()}
                  className="rounded-xl border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-500/10 disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Delete app"}
                </button>
              </div>

              <p className="mt-4 text-sm leading-6 text-[var(--pp-text)]">
                {selected.mike.summary}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
                    Primary fit
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--pp-text)]">
                    {selected.mike.primaryFit}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
                    Also fits
                  </p>
                  <p className="mt-1 text-sm text-[var(--pp-text)]">
                    {selected.mike.secondaryFits.length
                      ? selected.mike.secondaryFits.join(", ")
                      : "—"}
                  </p>
                </div>
              </div>

              {selected.mike.strengths.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {selected.mike.strengths.map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-2 text-xs text-[var(--pp-text-muted)]"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--pp-accent)]" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-5 border-t border-[var(--pp-border)] pt-4 space-y-3 text-sm">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
                    Driver’s license
                  </p>
                  <p className="mt-1 text-[var(--pp-text)]">
                    {selected.validDriverLicense === "yes"
                      ? "Yes — valid license"
                      : selected.validDriverLicense === "no"
                        ? "No"
                        : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
                    Why Party Perfect
                  </p>
                  <p className="mt-1 text-[var(--pp-text)]">
                    {selected.whyPartyPerfect}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
                    Work history
                  </p>
                  {selected.workHistory?.length ? (
                    <ul className="mt-2 space-y-2">
                      {selected.workHistory.map((job, index) => (
                        <li
                          key={`${job.employer}-${index}`}
                          className="rounded-xl border border-[var(--pp-border)] px-3 py-2 text-xs leading-5 text-[var(--pp-text)]"
                        >
                          <p className="font-semibold">
                            {job.employer}
                            {job.roleTitle ? ` · ${job.roleTitle}` : ""}
                          </p>
                          <p className="text-[var(--pp-text-muted)]">
                            {job.startDate || "—"} →{" "}
                            {job.stillEmployed
                              ? "Present"
                              : job.endDate || "—"}
                          </p>
                          <p className="text-[var(--pp-text-muted)]">
                            Pay: {job.startPay || "—"} → {job.endPay || "—"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[var(--pp-text)]">—</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
                    Extra notes
                  </p>
                  <p className="mt-1 text-[var(--pp-text)]">
                    {selected.experience || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
                    Availability
                  </p>
                  <p className="mt-1 text-[var(--pp-text)]">
                    {selected.availability}
                  </p>
                </div>
                {selected.videoUrl && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
                      Video
                    </p>
                    <a
                      href={selected.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-sm pp-accent-text underline"
                    >
                      Open video link
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
