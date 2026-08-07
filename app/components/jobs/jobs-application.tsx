"use client";

import { PartyPerfectLogo } from "@/app/components/dashboard/party-perfect-logo";
import { BRAND } from "@/lib/brand";
import {
  JOB_REFERRAL_SOURCES,
  JOB_ROLES,
  type CollegeStatus,
  type JobReferralSourceId,
  type JobRoleId,
  type WorkHistoryEntry,
} from "@/lib/jobs";
import { useEffect, useMemo, useRef, useState } from "react";

type Stage = "hero" | "roles" | "form" | "success";
type FormStep = 1 | 2 | 3;

interface FormState {
  fullName: string;
  phone: string;
  email: string;
  city: string;
  eligibleToWork: "yes" | "no" | "";
  over18: "yes" | "no" | "";
  validDriverLicense: "yes" | "no" | "";
  highSchoolGraduated: "yes" | "no" | "";
  collegeStatus: CollegeStatus;
  schoolingNotes: string;
  referralSource: JobReferralSourceId;
  referralName: string;
  availability: string;
  physicalAbility: string;
  whyPartyPerfect: string;
  experience: string;
  workHistory: WorkHistoryEntry[];
  videoUrl: string;
}

const EMPTY_JOB: WorkHistoryEntry = {
  employer: "",
  roleTitle: "",
  startDate: "",
  endDate: "",
  startPay: "",
  endPay: "",
  stillEmployed: false,
};

const EMPTY_FORM: FormState = {
  fullName: "",
  phone: "",
  email: "",
  city: "Tulsa",
  eligibleToWork: "",
  over18: "",
  validDriverLicense: "",
  highSchoolGraduated: "",
  collegeStatus: "",
  schoolingNotes: "",
  referralSource: "",
  referralName: "",
  availability: "",
  physicalAbility: "",
  whyPartyPerfect: "",
  experience: "",
  workHistory: [{ ...EMPTY_JOB }],
  videoUrl: "",
};

export function JobsApplication() {
  const [stage, setStage] = useState<Stage>("hero");
  const [roles, setRoles] = useState<JobRoleId[]>([]);
  const [formStep, setFormStep] = useState<FormStep>(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const resumeRef = useRef<HTMLInputElement>(null);

  const progress = useMemo(() => {
    if (stage !== "form") return 0;
    return (formStep / 3) * 100;
  }, [stage, formStep]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [stage, formStep]);

  function toggleRole(id: JobRoleId) {
    setRoles((current) => {
      if (id === "open") {
        return current.includes("open") ? [] : ["open"];
      }
      const withoutOpen = current.filter((role) => role !== "open");
      return withoutOpen.includes(id)
        ? withoutOpen.filter((role) => role !== id)
        : [...withoutOpen, id];
    });
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function updateWorkHistory(
    index: number,
    patch: Partial<WorkHistoryEntry>,
  ) {
    setForm((current) => {
      const workHistory = current.workHistory.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry,
      );
      return { ...current, workHistory };
    });
    setError(null);
  }

  function addWorkHistory() {
    setForm((current) => {
      if (current.workHistory.length >= 3) return current;
      return {
        ...current,
        workHistory: [...current.workHistory, { ...EMPTY_JOB }],
      };
    });
    setError(null);
  }

  function removeWorkHistory(index: number) {
    setForm((current) => {
      const workHistory = current.workHistory.filter((_, i) => i !== index);
      return {
        ...current,
        workHistory: workHistory.length ? workHistory : [{ ...EMPTY_JOB }],
      };
    });
    setError(null);
  }

  function focusSchooling() {
    window.requestAnimationFrame(() => {
      document
        .getElementById("jobs-schooling")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function validateStep(step: FormStep) {
    if (step === 1) {
      if (!form.fullName.trim() || !form.phone.trim() || !form.email.trim()) {
        return "Add your name, phone, and email to keep going.";
      }
      if (!form.email.includes("@")) return "That email doesn’t look right yet.";
      if (form.eligibleToWork !== "yes" || form.over18 !== "yes") {
        return "You need to be 18+ and eligible to work in the U.S.";
      }
      if (form.validDriverLicense !== "yes" && form.validDriverLicense !== "no") {
        return "Tell us if you have a valid driver’s license.";
      }
      if (
        form.highSchoolGraduated !== "yes" &&
        form.highSchoolGraduated !== "no"
      ) {
        focusSchooling();
        return "Please answer whether you graduated high school (or GED) in the Schooling box below.";
      }
      if (!form.collegeStatus) {
        focusSchooling();
        return "Pick a college option in the Schooling box (No college is fine).";
      }
      if (!form.referralSource) {
        window.requestAnimationFrame(() => {
          document
            .getElementById("jobs-referral")
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        return "Quick tap — how’d you hear about us?";
      }
      if (
        form.referralSource === "friend" &&
        form.referralName.trim().length < 2
      ) {
        return "Who referred you? First name is perfect.";
      }
    }
    if (step === 2) {
      if (!form.availability.trim() || !form.physicalAbility.trim()) {
        return "Tell us about availability and physical ability.";
      }
      if (form.whyPartyPerfect.trim().length < 8) {
        return "Give us a quick “Why Party Perfect?” (even one sentence works).";
      }
    }
    if (step === 3) {
      const incomplete = form.workHistory.find((entry) => {
        if (!entry.employer.trim() || !entry.startDate.trim() || !entry.startPay.trim()) {
          return true;
        }
        if (entry.stillEmployed) return !entry.endPay.trim();
        return !entry.endDate.trim() || !entry.endPay.trim();
      });
      if (incomplete) {
        return "For each job, add employer, start date, start pay, and end pay (or current pay if still there).";
      }
    }
    return null;
  }

  async function submitApplication() {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        roles,
        ...form,
        videoUrl: form.videoUrl.trim() || undefined,
        schoolingNotes: form.schoolingNotes.trim() || undefined,
      };
      const body = new FormData();
      body.set("payload", JSON.stringify(payload));
      if (resumeFile) body.set("resume", resumeFile);

      const response = await fetch("/api/jobs/apply", {
        method: "POST",
        body,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof result?.error === "string"
            ? result.error
            : "Could not submit. Try again.",
        );
      }
      setStage("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative overflow-x-hidden">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <PartyPerfectLogo variant="compact" />
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--jobs-teal-deep)]">
          Tulsa · Hiring
        </p>
      </header>

      {stage === "hero" && (
        <section className="relative mx-auto flex min-h-[calc(100dvh-88px)] max-w-5xl flex-col justify-center px-5 pb-16 pt-6 sm:px-8">
          <div
            className="pointer-events-none absolute inset-x-0 top-8 -z-10 mx-auto h-[420px] max-w-3xl rounded-full opacity-70 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, rgba(0,191,165,0.28), transparent 68%)",
            }}
            aria-hidden
          />

          <p className="jobs-rise jobs-display text-sm font-bold uppercase tracking-[0.28em] text-[var(--jobs-teal-deep)]">
            Party Perfect Jobs
          </p>
          <h1 className="jobs-rise jobs-rise-delay-1 jobs-display mt-4 max-w-3xl text-4xl font-extrabold leading-[1.05] text-[var(--jobs-ink)] sm:text-6xl">
            Bring the energy.
            <span className="block bg-gradient-to-r from-[var(--jobs-teal)] to-[var(--jobs-teal-deep)] bg-clip-text text-transparent">
              Build the party.
            </span>
          </h1>
          <p className="jobs-rise jobs-rise-delay-2 mt-5 max-w-xl text-base leading-7 text-[var(--jobs-muted)] sm:text-lg">
            {BRAND.name} Event Rentals is hiring in {BRAND.location}. Apply in
            under 4 minutes — no marathon forms, just the good stuff.
          </p>

          <div className="jobs-rise jobs-rise-delay-3 mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setStage("roles")}
              className="jobs-cta rounded-2xl bg-[var(--jobs-teal)] px-8 py-4 text-base font-extrabold text-white shadow-[0_12px_28px_rgba(0,191,165,0.35)]"
              style={{ animation: "jobs-pulse-ring 1.8s ease-out infinite" }}
            >
              Start Application
            </button>
            <p className="text-sm font-semibold text-[var(--jobs-muted)]">
              ~3 minutes · Mobile friendly · Tulsa crew
            </p>
          </div>

          <div className="jobs-float mt-14 hidden max-w-md rounded-[2rem] border border-[var(--jobs-teal)]/20 bg-white/70 p-5 backdrop-blur sm:block">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--jobs-teal-deep)]">
              What you get
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--jobs-muted)]">
              Fast apply · Mike reviews your fit · Top candidates go straight to
              Josh
            </p>
          </div>
        </section>
      )}

      {stage === "roles" && (
        <section className="jobs-panel-enter mx-auto max-w-5xl px-5 pb-20 pt-4 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--jobs-teal-deep)]">
            Step 0 · Interests
          </p>
          <h2 className="jobs-display mt-3 text-3xl font-extrabold sm:text-4xl">
            Where could you shine?
          </h2>
          <p className="mt-2 max-w-xl text-sm text-[var(--jobs-muted)] sm:text-base">
            Tap as many as you like — Mike will recommend the best fit later.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {JOB_ROLES.map((role) => {
              const selected = roles.includes(role.id);
              return (
                <button
                  key={role.id}
                  type="button"
                  data-selected={selected}
                  onClick={() => toggleRole(role.id)}
                  className={`jobs-role-card rounded-2xl border px-4 py-5 text-left ${
                    selected
                      ? "border-[var(--jobs-teal)] bg-[var(--jobs-teal-soft)] shadow-[0_10px_24px_rgba(0,191,165,0.18)]"
                      : "border-black/8 bg-white/80 hover:border-[var(--jobs-teal)]/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-2xl" aria-hidden>
                      {role.icon}
                    </span>
                    <span
                      className={`mt-1 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                        selected
                          ? "border-[var(--jobs-teal)] bg-[var(--jobs-teal)] text-white"
                          : "border-black/15 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  </div>
                  <p className="jobs-display mt-3 text-lg font-bold">
                    {role.label}
                  </p>
                  <p className="mt-1 text-sm text-[var(--jobs-muted)]">
                    {role.blurb}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setStage("hero")}
              className="rounded-xl px-4 py-3 text-sm font-bold text-[var(--jobs-muted)]"
            >
              Back
            </button>
            <button
              type="button"
              disabled={roles.length === 0}
              onClick={() => {
                setFormStep(1);
                setStage("form");
              }}
              className="jobs-cta rounded-2xl bg-[var(--jobs-teal)] px-7 py-3.5 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {stage === "form" && (
        <section className="jobs-panel-enter mx-auto max-w-2xl px-5 pb-24 pt-4 sm:px-8">
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.18em] text-[var(--jobs-muted)]">
              <span>
                Step {formStep} of 3
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5">
              <div
                className="jobs-progress-fill h-full rounded-full bg-gradient-to-r from-[var(--jobs-teal)] to-[var(--jobs-teal-deep)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {formStep === 1 && (
            <div className="space-y-4">
              <h2 className="jobs-display text-3xl font-extrabold">
                Let’s get your basics
              </h2>
              {error && (
                <p className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </p>
              )}
              <Field
                label="Full name"
                value={form.fullName}
                onChange={(value) => updateField("fullName", value)}
                placeholder="Alex Rivera"
                autoComplete="name"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Phone"
                  value={form.phone}
                  onChange={(value) => updateField("phone", value)}
                  placeholder="(918) 555-0100"
                  autoComplete="tel"
                  inputMode="tel"
                />
                <Field
                  label="Email"
                  value={form.email}
                  onChange={(value) => updateField("email", value)}
                  placeholder="you@email.com"
                  autoComplete="email"
                  inputMode="email"
                />
              </div>
              <Field
                label="City"
                value={form.city}
                onChange={(value) => updateField("city", value)}
                placeholder="Tulsa"
                autoComplete="address-level2"
              />
              <YesNo
                label="Eligible to work in the U.S.?"
                value={form.eligibleToWork}
                onChange={(value) => updateField("eligibleToWork", value)}
              />
              <YesNo
                label="Are you 18 or older?"
                value={form.over18}
                onChange={(value) => updateField("over18", value)}
              />
              <YesNo
                label="Do you have a valid driver’s license?"
                value={form.validDriverLicense}
                onChange={(value) => updateField("validDriverLicense", value)}
              />

              <div
                id="jobs-schooling"
                className="scroll-mt-24 space-y-4 rounded-3xl border-2 border-[var(--jobs-teal)]/35 bg-[var(--jobs-teal-soft)]/40 p-4 sm:p-5"
              >
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--jobs-teal-deep)]">
                    Schooling · required
                  </p>
                  <h3 className="jobs-display mt-1 text-xl font-extrabold text-[var(--jobs-ink)]">
                    High school &amp; college
                  </h3>
                  <p className="mt-1 text-sm text-[var(--jobs-muted)]">
                    Tap yes/no and pick one college option — then hit Next.
                  </p>
                </div>
                <YesNo
                  label="Did you graduate high school (or earn a GED)?"
                  value={form.highSchoolGraduated}
                  onChange={(value) => updateField("highSchoolGraduated", value)}
                />
                <div>
                  <p className="mb-2 text-sm font-extrabold text-[var(--jobs-ink)]">
                    College
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["none", "No college"],
                        ["some", "Some college"],
                        ["in_progress", "In college now"],
                        ["graduated", "College graduate"],
                      ] as const
                    ).map(([value, label]) => {
                      const active = form.collegeStatus === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => updateField("collegeStatus", value)}
                          className={`rounded-2xl border px-3 py-3 text-left text-sm font-bold ${
                            active
                              ? "border-[var(--jobs-teal)] bg-[var(--jobs-teal)] text-white"
                              : "border-black/10 bg-white text-[var(--jobs-ink)]"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Field
                  label="School name / notes (optional)"
                  value={form.schoolingNotes}
                  onChange={(value) => updateField("schoolingNotes", value)}
                  placeholder="High school, college, trade program…"
                />
              </div>

              <div id="jobs-referral" className="scroll-mt-24 space-y-3">
                <div>
                  <p className="text-sm font-extrabold text-[var(--jobs-ink)]">
                    How’d you hear about us?
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--jobs-muted)]">
                    One tap — keeps it simple.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {JOB_REFERRAL_SOURCES.map((source) => {
                    const active = form.referralSource === source.id;
                    return (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => {
                          updateField("referralSource", source.id);
                          if (source.id !== "friend") {
                            updateField("referralName", "");
                          }
                        }}
                        className={`rounded-full border px-3.5 py-2 text-sm font-bold transition ${
                          active
                            ? "border-[var(--jobs-teal)] bg-[var(--jobs-teal)] text-white"
                            : "border-black/10 bg-white text-[var(--jobs-ink)] hover:border-[var(--jobs-teal)]/40"
                        }`}
                      >
                        {source.label}
                      </button>
                    );
                  })}
                </div>
                {form.referralSource === "friend" && (
                  <Field
                    label="Who referred you?"
                    value={form.referralName}
                    onChange={(value) => updateField("referralName", value)}
                    placeholder="First name is perfect"
                    autoComplete="off"
                  />
                )}
              </div>
            </div>
          )}

          {formStep === 2 && (
            <div className="space-y-4">
              <h2 className="jobs-display text-3xl font-extrabold">
                Schedule & spark
              </h2>
              <Area
                label="Availability"
                value={form.availability}
                onChange={(value) => updateField("availability", value)}
                placeholder="Weekdays, weekends, mornings… whatever’s true for you"
              />
              <Area
                label="Physical ability"
                value={form.physicalAbility}
                onChange={(value) => updateField("physicalAbility", value)}
                placeholder="Comfortable lifting, standing, outdoor work, etc."
              />
              <Area
                label="Why Party Perfect?"
                value={form.whyPartyPerfect}
                onChange={(value) => updateField("whyPartyPerfect", value)}
                placeholder="One fun sentence is perfect"
              />
            </div>
          )}

          {formStep === 3 && (
            <div className="space-y-4">
              <h2 className="jobs-display text-3xl font-extrabold">
                Work history (last 3 years)
              </h2>
              <p className="text-sm text-[var(--jobs-muted)]">
                Add up to 3 jobs. Include start pay and end pay (or current pay
                if you’re still there).
              </p>

              {form.workHistory.map((job, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-black/8 bg-white/80 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--jobs-teal-deep)]">
                      Job {index + 1}
                    </p>
                    {form.workHistory.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeWorkHistory(index)}
                        className="text-xs font-bold text-[var(--jobs-muted)]"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <Field
                    label="Employer"
                    value={job.employer}
                    onChange={(value) =>
                      updateWorkHistory(index, { employer: value })
                    }
                    placeholder="Company name"
                  />
                  <Field
                    label="Role / title"
                    value={job.roleTitle}
                    onChange={(value) =>
                      updateWorkHistory(index, { roleTitle: value })
                    }
                    placeholder="Delivery driver, sales associate…"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Start date"
                      value={job.startDate}
                      onChange={(value) =>
                        updateWorkHistory(index, { startDate: value })
                      }
                      placeholder="MM/YYYY"
                    />
                    <Field
                      label="End date"
                      value={job.endDate}
                      onChange={(value) =>
                        updateWorkHistory(index, { endDate: value })
                      }
                      placeholder={job.stillEmployed ? "Present" : "MM/YYYY"}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-[var(--jobs-ink)]">
                    <input
                      type="checkbox"
                      checked={job.stillEmployed}
                      onChange={(event) =>
                        updateWorkHistory(index, {
                          stillEmployed: event.target.checked,
                          endDate: event.target.checked ? "Present" : "",
                        })
                      }
                      className="h-4 w-4 rounded border-black/20"
                    />
                    I still work here
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Starting pay"
                      value={job.startPay}
                      onChange={(value) =>
                        updateWorkHistory(index, { startPay: value })
                      }
                      placeholder="$15/hr or $32,000/yr"
                    />
                    <Field
                      label={job.stillEmployed ? "Current pay" : "Ending pay"}
                      value={job.endPay}
                      onChange={(value) =>
                        updateWorkHistory(index, { endPay: value })
                      }
                      placeholder="$17/hr or $36,000/yr"
                    />
                  </div>
                </div>
              ))}

              {form.workHistory.length < 3 && (
                <button
                  type="button"
                  onClick={addWorkHistory}
                  className="w-full rounded-2xl border border-dashed border-[var(--jobs-teal)]/50 bg-[var(--jobs-teal-soft)]/40 px-4 py-3 text-sm font-extrabold text-[var(--jobs-teal-deep)]"
                >
                  + Add another job
                </button>
              )}

              <Area
                label="Anything else about your experience? (optional)"
                value={form.experience}
                onChange={(value) => updateField("experience", value)}
                placeholder="Skills, tools, or wins you want Mike to know"
              />

              <div className="rounded-2xl border border-[var(--jobs-teal)]/30 bg-[var(--jobs-teal-soft)]/30 p-4">
                <p className="text-sm font-extrabold text-[var(--jobs-ink)]">
                  Resume (optional)
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--jobs-muted)]">
                  PDF, Word, or a clear photo of your resume. Our hiring team
                  reviews it with Mike’s score.
                </p>
                <input
                  ref={resumeRef}
                  type="file"
                  accept=".pdf,.doc,.docx,image/*,application/pdf"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (file && file.size > 8 * 1024 * 1024) {
                      setError("Keep resume under 8MB.");
                      setResumeFile(null);
                      if (resumeRef.current) resumeRef.current.value = "";
                      return;
                    }
                    setResumeFile(file);
                    setError(null);
                  }}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => resumeRef.current?.click()}
                    className="rounded-xl bg-white px-4 py-2.5 text-sm font-extrabold text-[var(--jobs-teal-deep)] shadow-sm"
                  >
                    {resumeFile ? "Change resume" : "Upload resume"}
                  </button>
                  {resumeFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setResumeFile(null);
                        if (resumeRef.current) resumeRef.current.value = "";
                      }}
                      className="text-xs font-bold text-[var(--jobs-muted)]"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {resumeFile && (
                  <p className="mt-2 truncate text-xs font-semibold text-[var(--jobs-teal-deep)]">
                    {resumeFile.name}
                  </p>
                )}
              </div>

              <Field
                label="Optional video link (30–60 sec)"
                value={form.videoUrl}
                onChange={(value) => updateField("videoUrl", value)}
                placeholder="TikTok, Instagram, Drive, or Loom URL"
              />
              <p className="text-xs leading-5 text-[var(--jobs-muted)]">
                Video is optional. A smile and 45 seconds of “here’s who I am”
                goes a long way.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (formStep === 1) {
                  setStage("roles");
                  return;
                }
                setFormStep((step) => (step - 1) as FormStep);
              }}
              className="rounded-xl px-4 py-3 text-sm font-bold text-[var(--jobs-muted)]"
            >
              Back
            </button>
            {formStep < 3 ? (
              <button
                type="button"
                onClick={() => {
                  const message = validateStep(formStep);
                  if (message) {
                    setError(message);
                    return;
                  }
                  if (formStep === 2) {
                    // Ensure at least one work-history row exists before step 3.
                    setForm((current) =>
                      current.workHistory.length
                        ? current
                        : { ...current, workHistory: [{ ...EMPTY_JOB }] },
                    );
                  }
                  setFormStep((step) => (step + 1) as FormStep);
                }}
                className="jobs-cta rounded-2xl bg-[var(--jobs-teal)] px-7 py-3.5 text-sm font-extrabold text-white"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  const message = validateStep(3);
                  if (message) {
                    setError(message);
                    return;
                  }
                  void submitApplication();
                }}
                className="jobs-cta rounded-2xl bg-[var(--jobs-teal)] px-7 py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
              >
                {submitting ? "Sending to Mike…" : "Submit application"}
              </button>
            )}
          </div>
        </section>
      )}

      {stage === "success" && (
        <section className="jobs-panel-enter relative mx-auto flex min-h-[70dvh] max-w-2xl flex-col items-center justify-center px-5 pb-24 text-center sm:px-8">
          <div className="jobs-success-burst pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {Array.from({ length: 14 }).map((_, index) => (
              <span
                key={index}
                style={{
                  left: `${8 + ((index * 7) % 84)}%`,
                  top: `${10 + (index % 5) * 8}%`,
                  background:
                    index % 2 === 0 ? "var(--jobs-teal)" : "#7ee8d8",
                  animationDelay: `${index * 0.05}s`,
                }}
              />
            ))}
          </div>

          <div className="jobs-float rounded-full bg-[var(--jobs-teal-soft)] px-4 py-1 text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--jobs-teal-deep)]">
            You’re in the queue
          </div>
          <h2 className="jobs-display mt-5 text-4xl font-extrabold sm:text-5xl">
            Thank you for applying!
          </h2>
          <p className="mt-4 max-w-md text-base leading-7 text-[var(--jobs-muted)]">
            We’ve got your application for Party Perfect Event Rentals. Our
            hiring team will review it and reach out if you’re a match.
          </p>
          <p className="mt-6 text-sm font-semibold text-[var(--jobs-teal-deep)]">
            Watch your phone — we’ll be in touch.
          </p>
          <button
            type="button"
            onClick={() => {
              setStage("hero");
              setRoles([]);
              setForm(EMPTY_FORM);
              setFormStep(1);
              setResumeFile(null);
              if (resumeRef.current) resumeRef.current.value = "";
              setError(null);
            }}
            className="jobs-cta mt-10 rounded-2xl border border-[var(--jobs-teal)]/40 bg-white px-6 py-3 text-sm font-extrabold text-[var(--jobs-teal-deep)]"
          >
            Back to home
          </button>
        </section>
      )}

      <footer className="border-t border-black/5 px-5 py-8 text-center text-xs text-[var(--jobs-muted)] sm:px-8">
        {BRAND.name} Event Rentals · {BRAND.location} · {BRAND.phone}
      </footer>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block text-left">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-[var(--jobs-muted)]">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-[var(--jobs-teal)] focus:ring-4 focus:ring-[var(--jobs-teal)]/15"
      />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-left">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-[var(--jobs-muted)]">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-[var(--jobs-teal)] focus:ring-4 focus:ring-[var(--jobs-teal)]/15"
      />
    </label>
  );
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "yes" | "no" | "";
  onChange: (value: "yes" | "no") => void;
}) {
  return (
    <div className="text-left">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--jobs-muted)]">
        {label}
      </p>
      <div className="flex gap-2">
        {(["yes", "no"] as const).map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-extrabold capitalize transition ${
                selected
                  ? "border-[var(--jobs-teal)] bg-[var(--jobs-teal)] text-white"
                  : "border-black/10 bg-white text-[var(--jobs-ink)] hover:border-[var(--jobs-teal)]/40"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
