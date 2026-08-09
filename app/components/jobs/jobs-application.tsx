"use client";

import { PartyPerfectLogo } from "@/app/components/dashboard/party-perfect-logo";
import { BRAND } from "@/lib/brand";
import {
  WHY_MIN,
  PHYSICAL_STORY_MIN,
  availabilityLabelFromSlots,
  isValidUsPhone,
  isValidEmail,
} from "@/lib/job-apply-validate";
import { normalizeJobLeadSource } from "@/lib/job-lead-sources";
import {
  JOB_REFERRAL_SOURCES,
  JOB_ROLES,
  type AvailabilitySlot,
  type CollegeStatus,
  type DaysMissedBucket,
  type JobReferralSourceId,
  type JobRoleId,
  type WorkHistoryEntry,
} from "@/lib/jobs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type Stage = "quick" | "enrich" | "success";
type FormStep = 1 | 2 | 3;

const AVAILABILITY_OPTIONS: { id: AvailabilitySlot; label: string }[] = [
  { id: "weekday_am", label: "Weekday mornings" },
  { id: "weekends", label: "Weekends" },
  { id: "early_am", label: "Early mornings" },
];

const DAYS_MISSED_OPTIONS: { id: Exclude<DaysMissedBucket, "">; label: string }[] =
  [
    { id: "0", label: "0" },
    { id: "1-2", label: "1–2" },
    { id: "3+", label: "3+" },
  ];

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
  hasReliableTransport: "yes" | "no" | "";
  physicalOutdoorOk: "yes" | "no" | "";
  earliestStartDate: string;
  daysMissedLast3Months: DaysMissedBucket;
  availabilitySlots: AvailabilitySlot[];
  availability: string;
  physicalAbility: string;
  physicalStory: string;
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
  hasReliableTransport: "",
  physicalOutdoorOk: "",
  earliestStartDate: "",
  daysMissedLast3Months: "",
  availabilitySlots: [],
  availability: "",
  physicalAbility: "",
  physicalStory: "",
  whyPartyPerfect: "",
  experience: "",
  workHistory: [{ ...EMPTY_JOB }],
  videoUrl: "",
};

export function JobsApplication() {
  const searchParams = useSearchParams();
  const leadSource = useMemo(
    () => normalizeJobLeadSource(searchParams.get("src")),
    [searchParams],
  );
  const [stage, setStage] = useState<Stage>("quick");
  const [roles, setRoles] = useState<JobRoleId[]>([]);
  const [formStep, setFormStep] = useState<FormStep>(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [weekendEarlyOk, setWeekendEarlyOk] = useState<"yes" | "no" | "">("");
  const resumeRef = useRef<HTMLInputElement>(null);

  const progress = useMemo(() => {
    if (stage !== "enrich") return 0;
    return (formStep / 3) * 100;
  }, [stage, formStep]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [stage, formStep]);

  useEffect(() => {
    const raw = searchParams.get("role");
    if (!raw) return;
    const match = JOB_ROLES.find((role) => role.id === raw);
    if (match) setRoles([match.id]);
  }, [searchParams]);

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

  function toggleAvailabilitySlot(slot: AvailabilitySlot) {
    setForm((current) => {
      const has = current.availabilitySlots.includes(slot);
      const availabilitySlots = has
        ? current.availabilitySlots.filter((s) => s !== slot)
        : [...current.availabilitySlots, slot];
      return {
        ...current,
        availabilitySlots,
        availability: availabilityLabelFromSlots(availabilitySlots),
      };
    });
    setError(null);
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

  function validateStep(step: FormStep) {
    // Enrich path is optional — only block incomplete sections the user started.
    if (step === 1) {
      if (form.email.trim() && !isValidEmail(form.email)) {
        return "Enter a valid email (or leave it blank).";
      }
    }
    if (step === 2) {
      const why = form.whyPartyPerfect.trim();
      if (why && why.length < WHY_MIN) {
        return `Why Party Perfect needs ~${WHY_MIN}+ characters, or clear it to skip.`;
      }
      const story = form.physicalStory.trim();
      if (story && story.length < PHYSICAL_STORY_MIN) {
        return "Add a bit more to your physical/fast-paced story, or clear it to skip.";
      }
    }
    if (step === 3) {
      const started = form.workHistory.filter(
        (e) => e.employer || e.roleTitle || e.startDate || e.startPay,
      );
      const incomplete = started.find((entry) => {
        if (!entry.employer.trim() || !entry.startDate.trim() || !entry.startPay.trim()) {
          return true;
        }
        if (entry.stillEmployed) return !entry.endPay.trim();
        return !entry.endDate.trim() || !entry.endPay.trim();
      });
      if (incomplete) {
        return "Finish each job you started — or clear those rows to skip.";
      }
    }
    return null;
  }

  function validateQuickApply() {
    if (!form.fullName.trim()) return "First name is required.";
    if (!isValidUsPhone(form.phone)) {
      return "Enter a valid 10-digit U.S. phone number.";
    }
    if (!form.city.trim()) return "City is required.";
    if (roles.length === 0) return "Pick at least one role.";
    return null;
  }

  async function submitApplication(mode: "quick" | "enrich") {
    if (mode === "quick") {
      const quickError = validateQuickApply();
      if (quickError) {
        setError(quickError);
        return;
      }
    } else {
      const stepError = validateStep(formStep);
      if (stepError) {
        setError(stepError);
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      let availabilitySlots = form.availabilitySlots;
      if (mode === "quick" && weekendEarlyOk === "yes") {
        availabilitySlots = ["weekends", "early_am"];
      } else if (mode === "quick" && weekendEarlyOk === "no") {
        availabilitySlots = [];
      }

      const payload = {
        roles,
        ...form,
        availabilitySlots,
        availability: availabilityLabelFromSlots(availabilitySlots),
        videoUrl: form.videoUrl.trim() || undefined,
        schoolingNotes: form.schoolingNotes.trim() || undefined,
        source: leadSource,
        company_website: honeypot,
        applyMode: mode,
        ...(mode === "enrich" && applicationId
          ? { applicationId }
          : {}),
        workHistory:
          mode === "quick"
            ? []
            : form.workHistory.filter(
                (e) => e.employer || e.roleTitle || e.startDate || e.startPay,
              ),
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
      if (typeof result?.id === "string") {
        setApplicationId(result.id);
      }
      if (mode === "quick") {
        setForm((current) => ({
          ...current,
          availabilitySlots,
          availability: availabilityLabelFromSlots(availabilitySlots),
        }));
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

      {stage === "quick" && (
        <section className="jobs-panel-enter mx-auto flex min-h-[calc(100dvh-88px)] max-w-xl flex-col px-5 pb-16 pt-4 sm:px-8">
          <p className="jobs-display text-sm font-bold uppercase tracking-[0.28em] text-[var(--jobs-teal-deep)]">
            Quick Apply · under 60 seconds
          </p>
          <h1 className="jobs-display mt-3 text-3xl font-extrabold leading-tight text-[var(--jobs-ink)] sm:text-4xl">
            Start here —{" "}
            <span className="bg-gradient-to-r from-[var(--jobs-teal)] to-[var(--jobs-teal-deep)] bg-clip-text text-transparent">
              we’ll text you
            </span>
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--jobs-muted)]">
            Four required fields. Optional yes/no below. Essays &amp; resume are
            optional after you submit.
          </p>

          {error && (
            <p className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
          >
            <label htmlFor="company_website">Company website</label>
            <input
              id="company_website"
              name="company_website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          <div className="mt-8 space-y-4">
            <Field
              label="First name *"
              value={form.fullName}
              onChange={(value) => updateField("fullName", value)}
              placeholder="Alex"
              autoComplete="given-name"
            />
            <Field
              label="Phone *"
              value={form.phone}
              onChange={(value) => updateField("phone", value)}
              placeholder="(918) 555-0100"
              autoComplete="tel"
              inputMode="tel"
            />
            <Field
              label="City *"
              value={form.city}
              onChange={(value) => updateField("city", value)}
              placeholder="Tulsa"
              autoComplete="address-level2"
            />

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--jobs-muted)]">
                Role interested in *
              </p>
              <div className="flex flex-wrap gap-2">
                {JOB_ROLES.map((role) => {
                  const selected = roles.includes(role.id);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleRole(role.id)}
                      className={`rounded-full border px-3.5 py-2 text-sm font-bold transition ${
                        selected
                          ? "border-[var(--jobs-teal)] bg-[var(--jobs-teal)] text-white"
                          : "border-black/10 bg-white text-[var(--jobs-ink)]"
                      }`}
                    >
                      {role.icon} {role.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--jobs-teal)]/25 bg-[var(--jobs-teal-soft)]/35 p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--jobs-teal-deep)]">
                Optional · helps Mike prioritize
              </p>
              <div className="mt-3 space-y-3">
                <YesNo
                  label="Can you work weekends / early mornings?"
                  value={weekendEarlyOk}
                  onChange={setWeekendEarlyOk}
                />
                <YesNo
                  label="Comfortable lifting ~50 lbs / outdoor work?"
                  value={form.physicalOutdoorOk}
                  onChange={(value) => updateField("physicalOutdoorOk", value)}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitApplication("quick")}
            className="jobs-cta mt-8 w-full rounded-2xl bg-[var(--jobs-teal)] px-8 py-4 text-base font-extrabold text-white shadow-[0_12px_28px_rgba(0,191,165,0.35)] disabled:opacity-50"
            style={{ animation: "jobs-pulse-ring 1.8s ease-out infinite" }}
          >
            {submitting ? "Sending…" : "Submit Quick Apply"}
          </button>
          <p className="mt-3 text-center text-xs font-semibold text-[var(--jobs-muted)]">
            {BRAND.name} · {BRAND.location} · Mobile friendly
          </p>
        </section>
      )}

      {stage === "enrich" && (
        <section className="jobs-panel-enter mx-auto max-w-2xl px-5 pb-24 pt-4 sm:px-8">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--jobs-teal-deep)]">
              Optional · stand out
            </p>
            <div className="mt-2 flex items-center justify-between text-xs font-bold uppercase tracking-[0.18em] text-[var(--jobs-muted)]">
              <span>Extras {formStep} of 3</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5">
              <div
                className="jobs-progress-fill h-full rounded-full bg-gradient-to-r from-[var(--jobs-teal)] to-[var(--jobs-teal-deep)]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-[var(--jobs-muted)]">
              Your Quick Apply is already in — add anything you want, or skip.
            </p>
          </div>

          {formStep === 1 && (
            <div className="relative space-y-4">
              {/* Honeypot — hidden from humans, bots often autofill */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
              >
                <label htmlFor="company_website">Company website</label>
                <input
                  id="company_website"
                  name="company_website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>
              <h2 className="jobs-display text-3xl font-extrabold">
                Add more details
              </h2>
              <p className="text-sm text-[var(--jobs-muted)]">
                Email, schooling, and eligibility help — all optional.
              </p>
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
              <YesNo
                label="Reliable transportation to 8401 E 41st St, Tulsa?"
                value={form.hasReliableTransport}
                onChange={(value) => updateField("hasReliableTransport", value)}
              />
              <YesNo
                label="OK with outdoor heat and lifting 50+ lbs (tents/delivery)?"
                value={form.physicalOutdoorOk}
                onChange={(value) => updateField("physicalOutdoorOk", value)}
              />

              <div
                id="jobs-schooling"
                className="scroll-mt-24 space-y-4 rounded-3xl border-2 border-[var(--jobs-teal)]/35 bg-[var(--jobs-teal-soft)]/40 p-4 sm:p-5"
              >
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--jobs-teal-deep)]">
                    Schooling · optional
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

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--jobs-muted)]">
                  Availability (pick all that fit)
                </p>
                <div className="flex flex-col gap-2">
                  {AVAILABILITY_OPTIONS.map((option) => {
                    const selected = form.availabilitySlots.includes(option.id);
                    return (
                      <label
                        key={option.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 text-sm font-bold transition ${
                          selected
                            ? "border-[var(--jobs-teal)] bg-[var(--jobs-teal-soft)] text-[var(--jobs-ink)]"
                            : "border-black/10 bg-white text-[var(--jobs-ink)] hover:border-[var(--jobs-teal)]/40"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleAvailabilitySlot(option.id)}
                          className="h-4 w-4 rounded border-black/20"
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              <Field
                label="Earliest start date"
                value={form.earliestStartDate}
                onChange={(value) => updateField("earliestStartDate", value)}
                type="date"
              />

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--jobs-muted)]">
                  Days of work missed in the last 3 months
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {DAYS_MISSED_OPTIONS.map((option) => {
                    const active = form.daysMissedLast3Months === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          updateField("daysMissedLast3Months", option.id)
                        }
                        className={`rounded-2xl border px-3 py-3 text-sm font-extrabold ${
                          active
                            ? "border-[var(--jobs-teal)] bg-[var(--jobs-teal)] text-white"
                            : "border-black/10 bg-white text-[var(--jobs-ink)]"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Area
                label="Physical ability (brief note)"
                value={form.physicalAbility}
                onChange={(value) => updateField("physicalAbility", value)}
                placeholder="Comfortable lifting, standing, outdoor work, etc."
              />
              <Area
                label="Describe a time you did physical or fast-paced work"
                value={form.physicalStory}
                onChange={(value) => updateField("physicalStory", value)}
                placeholder="A few sentences — what you did, how hard it was, how you handled it"
              />
              <div>
                <Area
                  label="Why Party Perfect?"
                  value={form.whyPartyPerfect}
                  onChange={(value) => updateField("whyPartyPerfect", value)}
                  placeholder="What draws you to this crew? A real sentence or two."
                />
                <p className="mt-1.5 text-xs text-[var(--jobs-muted)]">
                  At least {WHY_MIN} characters
                  {form.whyPartyPerfect.trim().length > 0
                    ? ` · ${form.whyPartyPerfect.trim().length}/${WHY_MIN}`
                    : ""}
                </p>
              </div>
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
                  setStage("success");
                  return;
                }
                setFormStep((step) => (step - 1) as FormStep);
              }}
              className="rounded-xl px-4 py-3 text-sm font-bold text-[var(--jobs-muted)]"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (formStep < 3) {
                  setFormStep((step) => (step + 1) as FormStep);
                  setError(null);
                  return;
                }
                setStage("success");
              }}
              className="rounded-xl px-4 py-3 text-sm font-bold text-[var(--jobs-muted)]"
            >
              Skip
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
                onClick={() => void submitApplication("enrich")}
                className="jobs-cta rounded-2xl bg-[var(--jobs-teal)] px-7 py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Save extras"}
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
              setFormStep(1);
              setError(null);
              setStage("enrich");
            }}
            className="jobs-cta mt-8 w-full max-w-sm rounded-2xl bg-[var(--jobs-teal)] px-6 py-3.5 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(0,191,165,0.28)]"
          >
            Add more to stand out
          </button>
          <p className="mt-2 text-xs text-[var(--jobs-muted)]">
            Optional — resume, work history, why Party Perfect
          </p>
          <button
            type="button"
            onClick={() => {
              setStage("quick");
              setRoles([]);
              setForm(EMPTY_FORM);
              setFormStep(1);
              setApplicationId(null);
              setWeekendEarlyOk("");
              setResumeFile(null);
              if (resumeRef.current) resumeRef.current.value = "";
              setError(null);
            }}
            className="jobs-cta mt-6 rounded-2xl border border-[var(--jobs-teal)]/40 bg-white px-6 py-3 text-sm font-extrabold text-[var(--jobs-teal-deep)]"
          >
            Done
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
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  type?: React.HTMLInputTypeAttribute;
}) {
  return (
    <label className="block text-left">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-[var(--jobs-muted)]">
        {label}
      </span>
      <input
        type={type}
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
