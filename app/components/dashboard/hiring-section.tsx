"use client";

import { PageHeader } from "@/app/components/dashboard/page-header";
import { candidateSocialSearchLinks } from "@/lib/candidate-social";
import {
  HIRE_HIRED_REASONS,
  HIRE_REJECT_REASONS,
  type HireOutcome,
} from "@/lib/hiring-reason-options";
import {
  countAppsOnTulsaDay,
  HIRING_DAILY_GOAL_MAX,
  HIRING_DAILY_GOAL_MIN,
  hiringGoalLabel,
  hiringGoalStatus,
} from "@/lib/hiring-goals";
import type { JobApplication } from "@/lib/jobs";
import { JOB_ROLES, referralSourceLabel, roleLabel } from "@/lib/jobs";
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
  onDelete: (
    id: string,
    payload: {
      reasonId: string;
      notes?: string;
      outcome: HireOutcome;
    },
  ) => Promise<void>;
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
  const [closeOpen, setCloseOpen] = useState(true);
  const [outcome, setOutcome] = useState<HireOutcome | null>(null);
  const [reasonId, setReasonId] = useState("");
  const [reasonNotes, setReasonNotes] = useState("");

  useEffect(() => {
    if (
      selectedId &&
      !applications.some((app) => app.id === selectedId) &&
      applications[0]
    ) {
      setSelectedId(applications[0].id);
    }
  }, [applications, selectedId]);

  useEffect(() => {
    setOutcome(null);
    setReasonId("");
    setReasonNotes("");
    setCloseOpen(true);
    setError(null);
  }, [selectedId]);

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

  const appsToday = useMemo(
    () => countAppsOnTulsaDay(applications.map((app) => app.submittedAt)),
    [applications],
  );
  const goalStatus = hiringGoalStatus(appsToday);
  const goalHint = hiringGoalLabel(appsToday);

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

  const reasonOptions =
    outcome === "hired" ? HIRE_HIRED_REASONS : HIRE_REJECT_REASONS;

  function pickOutcome(next: HireOutcome) {
    setOutcome(next);
    setReasonId("");
    setReasonNotes("");
    setCloseOpen(true);
    setError(null);
  }

  async function handleCloseApp() {
    if (!selected) return;
    if (!outcome) {
      setError("Choose Hired or Rejected so Mike knows the outcome.");
      return;
    }
    if (!reasonId) {
      setError(
        "Mike needs to know why — pick a reason to teach scoring/filter.",
      );
      return;
    }
    if (reasonId === "other" && reasonNotes.trim().length < 3) {
      setError("Add a short note for “Other” so Mike can learn.");
      return;
    }
    const label = outcome === "hired" ? "Hired" : "Rejected";
    const ok = window.confirm(
      `${label} ${selected.fullName}? Mike saves your reason and removes them from the list.`,
    );
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(selected.id, {
        reasonId,
        notes: reasonNotes.trim() || undefined,
        outcome,
      });
      setFeedback(
        outcome === "hired"
          ? `Hired ${selected.fullName} — Mike logged why (positive pattern).`
          : `Rejected ${selected.fullName} — Mike logged why (filter pattern).`,
      );
      setSelectedId(null);
      setOutcome(null);
      setReasonId("");
      setReasonNotes("");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not close application.",
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
        description={`Close every app as Hired or Rejected + why — Mike learns for scoring. Always hiring all roles. Goal ${HIRING_DAILY_GOAL_MIN}–${HIRING_DAILY_GOAL_MAX}/day. 70+ flagged for Josh.`}
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

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="pp-panel rounded-2xl px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
            Today vs goal
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--pp-text)]">
            {appsToday}
            <span className="text-base font-medium text-[var(--pp-text-muted)]">
              {" "}
              / {HIRING_DAILY_GOAL_MIN}–{HIRING_DAILY_GOAL_MAX}
            </span>
          </p>
          <p
            className={`mt-1 text-xs font-medium ${
              goalStatus === "hit" || goalStatus === "over"
                ? "text-emerald-600"
                : goalStatus === "building"
                  ? "pp-accent-text"
                  : "text-amber-700"
            }`}
          >
            {goalHint}
          </p>
        </div>
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

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, phone, email…"
          className="pp-input min-h-11 w-full min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm sm:min-w-[180px]"
        />
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`min-h-11 rounded-xl px-3 py-2.5 text-sm font-semibold ${
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
          className={`min-h-11 rounded-xl px-3 py-2.5 text-sm font-semibold ${
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
          className={`min-h-11 rounded-xl px-3 py-2.5 text-sm font-semibold ${
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
          className="pp-input min-h-11 w-full rounded-xl px-3 py-2.5 text-sm sm:w-auto"
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
          <div
            className={`space-y-2 ${selectedId ? "hidden lg:block" : ""}`}
          >
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
                    {app.resumeFileName ||
                    app.resumeBlobPathname ||
                    app.resumeDataUrl
                      ? " · Resume"
                      : ""}
                  </p>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="pp-panel rounded-2xl p-4 sm:p-5">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="mb-3 flex min-h-11 items-center gap-2 rounded-xl border border-[var(--pp-border)] px-3 text-sm font-medium text-[var(--pp-text)] lg:hidden"
              >
                ← Back to applicants
              </button>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] pp-accent-text">
                    Mike review
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-[var(--pp-text)]">
                    {selected.fullName}
                  </h3>
                  <p className="mt-1 break-all text-sm text-[var(--pp-text-muted)]">
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

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <a
                  href={`tel:${selected.phone.replace(/[^\d+]/g, "")}`}
                  className="pp-btn-primary min-h-11 px-3 py-2.5 text-center text-sm sm:flex-1"
                >
                  Call
                </a>
                <a
                  href={`sms:${selected.phone.replace(/[^\d+]/g, "")}`}
                  className="pp-btn-secondary min-h-11 px-3 py-2.5 text-center text-sm sm:flex-1"
                >
                  Text
                </a>
                <a
                  href={`mailto:${encodeURIComponent(selected.email)}?subject=${encodeURIComponent(`Party Perfect hiring — ${selected.fullName}`)}`}
                  className="pp-btn-secondary min-h-11 px-3 py-2.5 text-center text-sm sm:flex-1"
                >
                  Email
                </a>
              </div>

              <div className="mt-4 rounded-2xl border border-[var(--pp-accent)]/35 bg-[var(--pp-accent-soft)]/25 px-4 py-4">
                <p className="text-sm font-semibold text-[var(--pp-text)]">
                  Close this application — Mike asks why
                </p>
                <p className="mt-1 text-xs text-[var(--pp-text-muted)]">
                  No silent deletes. Pick Hired or Rejected, then the reason.
                  Mike uses this to score and filter the next apps.
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => pickOutcome("hired")}
                    className={`rounded-xl px-3 py-3 text-sm font-semibold ${
                      outcome === "hired"
                        ? "bg-emerald-600 text-white"
                        : "border border-emerald-600/40 text-emerald-800 hover:bg-emerald-500/10"
                    }`}
                  >
                    Hired
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => pickOutcome("rejected")}
                    className={`rounded-xl px-3 py-3 text-sm font-semibold ${
                      outcome === "rejected"
                        ? "bg-red-600 text-white"
                        : "border border-red-500/40 text-red-800 hover:bg-red-500/10"
                    }`}
                  >
                    Rejected
                  </button>
                </div>

                {closeOpen && outcome && (
                  <div className="mt-4 border-t border-[var(--pp-border)] pt-3">
                    <p className="text-xs font-semibold text-[var(--pp-text)]">
                      Why{" "}
                      {outcome === "hired" ? "did we hire" : "did we reject"}{" "}
                      {selected.fullName}?
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {reasonOptions.map((reason) => {
                        const active = reasonId === reason.id;
                        return (
                          <button
                            key={reason.id}
                            type="button"
                            onClick={() => setReasonId(reason.id)}
                            className={`rounded-xl px-3 py-1.5 text-left text-xs font-medium ${
                              active
                                ? outcome === "hired"
                                  ? "bg-emerald-600 text-white"
                                  : "bg-red-600 text-white"
                                : "border border-[var(--pp-border)] text-[var(--pp-text-muted)] hover:border-[var(--pp-accent)]"
                            }`}
                          >
                            {reason.label}
                          </button>
                        );
                      })}
                    </div>
                    <textarea
                      value={reasonNotes}
                      onChange={(event) => setReasonNotes(event.target.value)}
                      rows={2}
                      placeholder={
                        outcome === "hired"
                          ? "Optional notes (required if Other) — e.g. strong tent call, starts Monday"
                          : "Optional notes (required if Other) — e.g. only wanted AC desk hours"
                      }
                      className="pp-input mt-3 w-full rounded-xl px-3 py-2 text-xs"
                    />
                    <button
                      type="button"
                      disabled={deleting || !reasonId}
                      onClick={() => void handleCloseApp()}
                      className={`mt-3 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 ${
                        outcome === "hired" ? "bg-emerald-600" : "bg-red-600"
                      }`}
                    >
                      {deleting
                        ? "Saving for Mike…"
                        : outcome === "hired"
                          ? "Save Hired + teach Mike"
                          : "Save Rejected + teach Mike"}
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-accent-muted)]/30 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
                  Find a visual (open in new tab — verify it’s them)
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {candidateSocialSearchLinks(selected).map((link) => (
                    <a
                      key={link.label}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="pp-btn-secondary px-3 py-1.5 text-xs"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
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
                    Schooling
                  </p>
                  <p className="mt-1 text-[var(--pp-text)]">
                    High school / GED:{" "}
                    {selected.highSchoolGraduated === "yes"
                      ? "Graduated"
                      : selected.highSchoolGraduated === "no"
                        ? "No"
                        : "—"}
                  </p>
                  <p className="mt-0.5 text-[var(--pp-text)]">
                    College:{" "}
                    {selected.collegeStatus === "none"
                      ? "None"
                      : selected.collegeStatus === "some"
                        ? "Some college"
                        : selected.collegeStatus === "in_progress"
                          ? "Currently attending"
                          : selected.collegeStatus === "graduated"
                            ? "Graduated"
                            : "—"}
                  </p>
                  {selected.schoolingNotes ? (
                    <p className="mt-1 text-xs text-[var(--pp-text-muted)]">
                      {selected.schoolingNotes}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
                    How they heard about us
                  </p>
                  <p className="mt-1 text-[var(--pp-text)]">
                    {selected.referralSource === "friend" && selected.referralName
                      ? `${referralSourceLabel(selected.referralSource)} — ${selected.referralName}`
                      : referralSourceLabel(selected.referralSource)}
                  </p>
                </div>
                {(selected.resumeFileName ||
                  selected.resumeBlobPathname ||
                  selected.resumeDataUrl) && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]">
                      Resume
                    </p>
                    <a
                      href={`/api/jobs/resume/${selected.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex min-h-10 items-center rounded-xl border border-[var(--pp-accent)]/40 bg-[var(--pp-accent-soft)]/40 px-3 py-2 text-sm font-medium pp-accent-text"
                    >
                      Open resume
                      {selected.resumeFileName
                        ? ` · ${selected.resumeFileName}`
                        : ""}
                    </a>
                  </div>
                )}
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
