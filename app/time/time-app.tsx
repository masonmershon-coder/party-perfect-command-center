"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  InstallOnboarding,
  type InstallPrompt,
} from "@/app/time/install-onboarding";
import {
  canUseTimeAdmin,
  TimeAdminPanel,
  type TimeAdminScreen,
} from "@/app/time/time-admin";
import { TimeLogoSupportGate } from "@/app/time/time-logo-support";
import { TIME_COPY, pickClockOutMessage } from "@/lib/time/strings";
import { formatHours } from "@/lib/time/hours";
import type {
  AbsenceReason,
  CorrectionIssueType,
  PunchType,
  TimeCapability,
  TimeOffReason,
} from "@/lib/time/types";

type Me = {
  employee: {
    preferredName: string;
    ptoEligible: boolean;
    vacationEligible: boolean;
    capabilities: TimeCapability[];
  };
  status: "NOT_CLOCKED_IN" | "CLOCKED_IN" | "ON_LUNCH";
  nextPunches: PunchType[];
  todayHours: string;
  weekHours: string;
  todaySeconds?: number;
  weekSeconds?: number;
  punches: { id: string; type: string; occurredAt: string; source?: string; sourceLabel?: string | null }[];
  corrections: {
    id: string;
    issueType: string;
    state: string;
    affectedDate: string;
    employeeExplanation: string;
    adminRemark: string;
  }[];
  absences: {
    id: string;
    reason: string;
    startDate: string;
    endDate: string;
    state: string;
    employeeNote: string;
  }[];
  timeOff: {
    id: string;
    reason: string;
    startDate: string;
    endDate: string;
    state: string;
  }[];
  leave: { type: string; grantedHours: number; usedHours: number }[];
  leaveVisible: boolean;
  notifications: { id: string; title: string; body: string; readAt: string | null }[];
  unreadNotificationCount: number;
  forgottenClockOut?: {
    shiftId: string;
    startedAt: string;
    safetyClosedAt: string | null;
    safetyCloseRule: string | null;
  } | null;
};

type Screen =
  | "home"
  | "history"
  | "requests"
  | "leave"
  | "inbox"
  | TimeAdminScreen;
type RequestForm = "menu" | "fix" | "absence" | "timeoff" | "done";

const copy = TIME_COPY.en;

const FIX_OPTIONS: { id: CorrectionIssueType; label: string }[] = [
  { id: "forgot_clock_in", label: "Forgot to clock in" },
  { id: "forgot_clock_out", label: "Forgot to clock out" },
  { id: "forgot_lunch_start", label: "Forgot to start lunch" },
  { id: "forgot_lunch_end", label: "Forgot to end lunch" },
  { id: "wrong_time", label: "Wrong time" },
  { id: "other", label: "Other" },
];

const ABSENCE_OPTIONS: AbsenceReason[] = ["Sick", "Vacation", "Personal", "Other"];

const TIME_OFF_OPTIONS: { id: TimeOffReason; label: string }[] = [
  { id: "doctors_appointment", label: "Doctor's appointment" },
  { id: "vacation", label: "Vacation" },
  { id: "personal_day", label: "Personal day" },
  { id: "other", label: "Other" },
];

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(path, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

function statusLabel(status: Me["status"]) {
  if (status === "CLOCKED_IN") return copy.youreClockedIn;
  if (status === "ON_LUNCH") return copy.onLunch;
  return copy.notClockedIn;
}

function primaryPunch(status: Me["status"]): { type: PunchType; label: string } {
  if (status === "NOT_CLOCKED_IN") return { type: "clock_in", label: copy.clockIn };
  if (status === "ON_LUNCH") return { type: "lunch_end", label: copy.endLunch };
  return { type: "clock_out", label: copy.clockOut };
}

export function TimeApp() {
  const [me, setMe] = useState<Me | null>(null);
  const [previewBanner, setPreviewBanner] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pin, setPin] = useState("");
  const [kioskMode, setKioskMode] = useState(false);
  const [forgotFinishLocal, setForgotFinishLocal] = useState("");
  const [forgotNote, setForgotNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [screen, setScreen] = useState<Screen>("home");
  const [showInstall, setShowInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPrompt | null>(null);
  const [form, setForm] = useState<RequestForm>("menu");
  const [sentMsg, setSentMsg] = useState<string>(copy.sentToShelly);
  const [issueType, setIssueType] = useState<CorrectionIssueType>("forgot_clock_in");
  const [affectedDate, setAffectedDate] = useState("");
  const [requested, setRequested] = useState("");
  const [explanation, setExplanation] = useState("");
  const [absReason, setAbsReason] = useState<AbsenceReason>("Sick");
  const [absStart, setAbsStart] = useState("");
  const [absEnd, setAbsEnd] = useState("");
  const [absNote, setAbsNote] = useState("");
  const [offReason, setOffReason] = useState<TimeOffReason>("personal_day");
  const [offStart, setOffStart] = useState("");
  const [offEnd, setOffEnd] = useState("");
  const [offNote, setOffNote] = useState("");
  const [replyFor, setReplyFor] = useState<{ kind: "correction" | "absence" | "time_off"; id: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [thread, setThread] = useState<{ body: string; authorRole: string; createdAt: string }[]>([]);
  const [punchPulse, setPunchPulse] = useState(false);
  const [clockOutThanks, setClockOutThanks] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [locationHelp, setLocationHelp] = useState(false);
  const [booting, setBooting] = useState(true);
  const inflightKeys = useRef<Partial<Record<PunchType, string>>>({});
  const meFetchedAt = useRef(Date.now());

  const applyMe = useCallback((next: Me) => {
    meFetchedAt.current = Date.now();
    setMe(next);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let kiosk = false;
    try {
      kiosk = window.localStorage.getItem("pp_time_mode") === "kiosk";
      setKioskMode(kiosk);
    } catch {
      // ignore
    }
    api<{ authenticated?: boolean; me?: Me; banner?: string | null }>("/api/time/session", {
      headers: kiosk ? { "X-PP-Time-Mode": "kiosk" } : undefined,
    })
      .then((r) => {
        if (r.data.banner) setPreviewBanner(r.data.banner);
        if (r.data.me) applyMe(r.data.me);
      })
      .finally(() => setBooting(false));
  }, [applyMe]);

  useEffect(() => {
    if (isStandalone()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as unknown as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    setShowInstall(true);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const clockLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }).format(now),
    [now],
  );

  const refreshMe = useCallback(async () => {
    const meR = await api<Me>("/api/time/me");
    if (meR.ok) applyMe(meR.data);
  }, [applyMe]);

  const openInbox = useCallback(async () => {
    setScreen("inbox");
    const unread = (me?.notifications || []).filter((n) => !n.readAt);
    if (!unread.length) return;
    await Promise.all(
      unread.map((n) =>
        api("/api/time/notifications", {
          method: "PATCH",
          body: JSON.stringify({ id: n.id }),
        }),
      ),
    );
    await refreshMe();
  }, [me?.notifications, refreshMe]);

  const doLogin = useCallback(async () => {
    setBusy(true);
    setError("");
    const r = await api<{ error?: string; me?: Me }>("/api/time/session", {
      method: "POST",
      headers: kioskMode ? { "X-PP-Time-Mode": "kiosk" } : undefined,
      body: JSON.stringify({
        firstName,
        lastName,
        pin,
        mode: kioskMode ? "kiosk" : "personal",
      }),
    });
    setBusy(false);
    if (!r.ok || !r.data.me) {
      setError((r.data as { error?: string }).error || "That name and PIN did not match.");
      return;
    }
    applyMe(r.data.me);
  }, [applyMe, firstName, kioskMode, lastName, pin]);

  const readGps = useCallback((): Promise<{
    geo: { latitude: number; longitude: number; accuracyM: number | null; capturedAt: string } | null;
    gpsPermission: "granted" | "denied" | "unavailable" | "timeout";
  }> => {
    return new Promise((resolve) => {
      // One-shot read at punch tap only — never watchPosition / continuous tracking.
      if (!navigator.geolocation) {
        resolve({ geo: null, gpsPermission: "unavailable" });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            geo: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracyM: pos.coords.accuracy,
              capturedAt: new Date(pos.timestamp).toISOString(),
            },
            gpsPermission: "granted",
          }),
        (err) => {
          if (err.code === err.PERMISSION_DENIED) resolve({ geo: null, gpsPermission: "denied" });
          else if (err.code === err.TIMEOUT) resolve({ geo: null, gpsPermission: "timeout" });
          else resolve({ geo: null, gpsPermission: "unavailable" });
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
      );
    });
  }, []);

  const punch = useCallback(
    async (type: PunchType) => {
      setBusy(true);
      setError("");
      setReceipt(null);
      setLocationHelp(false);
      const key =
        inflightKeys.current[type] ||
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? `${type}:${crypto.randomUUID()}`
          : `${type}:${Date.now()}`);
      inflightKeys.current[type] = key;
      try {
        const { geo, gpsPermission } = await readGps();
        if (!geo || gpsPermission !== "granted") {
          setError(copy.locationRequired);
          setLocationHelp(true);
          return;
        }
        const r = await api<{ error?: string; code?: string; me?: Me; punch?: { occurredAt: string } }>(
          "/api/time/punch",
          {
            method: "POST",
            body: JSON.stringify({
              type,
              idempotencyKey: key,
              clientReportedAt: new Date().toISOString(),
              gpsPermission,
              latitude: geo.latitude,
              longitude: geo.longitude,
              accuracyM: geo.accuracyM,
              gpsCapturedAt: geo.capturedAt,
            }),
          },
        );
        if (!r.ok) {
          const code = (r.data as { code?: string }).code;
          setError((r.data as { error?: string }).error || "Punch failed.");
          if (code === "location_required") setLocationHelp(true);
        } else if (r.data.me) {
          applyMe(r.data.me);
          setPunchPulse(true);
          window.setTimeout(() => setPunchPulse(false), 600);
          try {
            navigator.vibrate?.(12);
          } catch {
            // ignore
          }
          const at = r.data.punch?.occurredAt
            ? new Intl.DateTimeFormat("en-US", {
                timeZone: "America/Chicago",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(r.data.punch.occurredAt))
            : "";
          if (type === "clock_out") {
            setClockOutThanks(pickClockOutMessage(r.data.me.employee.preferredName));
          } else if (type === "clock_in") {
            setReceipt(at ? `Clocked in · ${at}` : "Clocked in");
          } else if (type === "lunch_start") {
            setReceipt(at ? `Lunch started · ${at}` : "Lunch started");
          } else if (type === "lunch_end") {
            setReceipt(at ? `Back from lunch · ${at}` : "Back from lunch");
          }
          if (type !== "clock_out") {
            window.setTimeout(() => setReceipt(null), 3200);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Punch failed.");
      } finally {
        delete inflightKeys.current[type];
        setBusy(false);
      }
    },
    [applyMe, readGps],
  );

  const submitFix = useCallback(async () => {
    setBusy(true);
    setError("");
    const r = await api<{ error?: string; message?: string }>("/api/time/corrections", {
      method: "POST",
      body: JSON.stringify({
        issueType,
        affectedDate,
        requestedCorrection: requested,
        employeeExplanation: explanation,
      }),
    });
    setBusy(false);
    if (!r.ok) {
      setError((r.data as { error?: string }).error || "Could not send.");
      return;
    }
    setSentMsg((r.data as { message?: string }).message || copy.sentToShelly);
    setForm("done");
    setRequested("");
    setExplanation("");
    await refreshMe();
  }, [issueType, affectedDate, requested, explanation, refreshMe]);

  const submitAbsence = useCallback(async () => {
    setBusy(true);
    setError("");
    const r = await api<{ error?: string; message?: string }>("/api/time/absences", {
      method: "POST",
      body: JSON.stringify({
        reason: absReason,
        startDate: absStart,
        endDate: absEnd || absStart,
        employeeNote: absNote,
      }),
    });
    setBusy(false);
    if (!r.ok) {
      setError((r.data as { error?: string }).error || "Could not send.");
      return;
    }
    setSentMsg((r.data as { message?: string }).message || copy.sentToShelly);
    setForm("done");
    setAbsNote("");
    await refreshMe();
  }, [absReason, absStart, absEnd, absNote, refreshMe]);

  const submitTimeOff = useCallback(async () => {
    setBusy(true);
    setError("");
    const r = await api<{ error?: string; message?: string }>("/api/time/time-off", {
      method: "POST",
      body: JSON.stringify({
        reason: offReason,
        startDate: offStart,
        endDate: offEnd || offStart,
        employeeNote: offNote,
      }),
    });
    setBusy(false);
    if (!r.ok) {
      setError((r.data as { error?: string }).error || "Could not send.");
      return;
    }
    setSentMsg((r.data as { message?: string }).message || copy.sentToShelly);
    setForm("done");
    setOffNote("");
    await refreshMe();
  }, [offReason, offStart, offEnd, offNote, refreshMe]);

  const openThread = useCallback(async (kind: "correction" | "absence" | "time_off", id: string) => {
    setReplyFor({ kind, id });
    const r = await api<{ messages: { body: string; authorRole: string; createdAt: string }[] }>(
      `/api/time/messages?kind=${kind}&id=${id}`,
    );
    if (r.ok) setThread(r.data.messages || []);
  }, []);

  const sendReply = useCallback(async () => {
    if (!replyFor || !replyText.trim()) return;
    setBusy(true);
    await api("/api/time/messages", {
      method: "POST",
      body: JSON.stringify({ kind: replyFor.kind, id: replyFor.id, body: replyText }),
    });
    setReplyText("");
    await openThread(replyFor.kind, replyFor.id);
    await refreshMe();
    setBusy(false);
  }, [replyFor, replyText, openThread, refreshMe]);

  if (booting) {
    return (
      <main className="time-shell">
        <img className="time-logo" src="/party-perfect-logo.png" alt="Party Perfect" />
        <p className="time-sub">Opening Party Perfect Time…</p>
      </main>
    );
  }

  if (!me) {
    return (
      <>
        <main className="time-shell">
          <img className="time-logo" src="/party-perfect-logo.png" alt="Party Perfect" />
          <h1 className="time-title">{copy.appName}</h1>
          <p className="time-sub">{copy.loginHint}</p>
          {previewBanner ? (
            <div className="time-error" style={{ background: "#fff8e6", color: "#7a5b00" }}>
              {previewBanner}
            </div>
          ) : null}
          {error ? <div className="time-error">{error}</div> : null}
          <input
            className="time-field"
            autoComplete="given-name"
            placeholder={copy.firstName}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <input
            className="time-field"
            autoComplete="family-name"
            placeholder={copy.lastName}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <input
            className="time-field"
            inputMode="numeric"
            type="password"
            autoComplete="current-password"
            placeholder="4-digit PIN"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
          <button className="time-btn time-btn-primary" type="button" disabled={busy} onClick={doLogin}>
            Sign in
          </button>
          <label className="time-mode-toggle">
            <input
              type="checkbox"
              checked={kioskMode}
              onChange={(e) => {
                const next = e.target.checked;
                setKioskMode(next);
                try {
                  window.localStorage.setItem("pp_time_mode", next ? "kiosk" : "personal");
                } catch {
                  // ignore
                }
              }}
            />
            <span>{copy.kioskMode}</span>
          </label>
        </main>
        <InstallOnboarding
          open={showInstall}
          installPrompt={deferredPrompt}
          onClose={() => setShowInstall(false)}
        />
      </>
    );
  }

  const primary = primaryPunch(me.status);
  const secondary = me.status === "CLOCKED_IN" ? { type: "lunch_start" as const, label: copy.startLunch } : null;
  const daySeconds =
    (me.todaySeconds ?? 0) +
    (me.status === "CLOCKED_IN" ? Math.max(0, Math.floor((now.getTime() - meFetchedAt.current) / 1000)) : 0);
  const dayTarget = 8 * 3600;
  const dayPct = Math.min(100, Math.round((daySeconds / dayTarget) * 100));
  const dayHoursLabel = me.status === "CLOCKED_IN" ? formatHours(daySeconds) : me.todayHours;
  const statusClass =
    me.status === "ON_LUNCH" ? "on-lunch" : me.status === "NOT_CLOCKED_IN" ? "off" : "";
  const capabilities = me.employee.capabilities || [];
  const isTimeAdmin = canUseTimeAdmin(capabilities);
  const canReview =
    capabilities.includes("timekeeping.review") ||
    capabilities.includes("timekeeping.admin") ||
    capabilities.includes("timekeeping.owner");
  const canEmployees =
    capabilities.includes("timekeeping.employees") ||
    capabilities.includes("timekeeping.admin") ||
    capabilities.includes("timekeeping.owner");
  const canPayroll =
    capabilities.includes("timekeeping.payroll") ||
    capabilities.includes("timekeeping.admin") ||
    capabilities.includes("timekeeping.owner");
  const canSecurity =
    capabilities.includes("timekeeping.security") ||
    capabilities.includes("timekeeping.owner");
  const adminScreen = screen.startsWith("admin-");

  return (
    <main className={`time-shell${screen === "home" ? " time-shell-home" : ""}${adminScreen ? " time-shell-admin" : ""}`}>
      <TimeLogoSupportGate
        capabilities={capabilities}
        appVersion={process.env.NEXT_PUBLIC_APP_VERSION || "1.2.0"}
        onSignedOut={() => {
          setMe(null);
          setScreen("home");
          setFirstName("");
          setLastName("");
          setPin("");
        }}
      />
      {previewBanner ? (
        <div className="time-error" style={{ background: "#fff8e6", color: "#7a5b00" }}>
          {previewBanner}
        </div>
      ) : null}
      {error ? <div className="time-error">{error}</div> : null}
      {locationHelp ? (
        <div className="time-location-help" role="status">
          <p>{copy.locationPrivacy}</p>
          <p className="time-muted">{copy.locationPrivacyPrinciple}</p>
          <p>{copy.locationHelpIos}</p>
          <p>{copy.locationHelpAndroid}</p>
        </div>
      ) : null}

      {adminScreen ? (
        <TimeAdminPanel
          screen={screen as TimeAdminScreen}
          capabilities={capabilities}
        />
      ) : null}

      {screen === "home" ? (
        <div className="time-home-enter" key={me.status}>
          <h1 className="time-title">{me.employee.preferredName}</h1>
          <p className="time-clock">{clockLabel}</p>
          <div style={{ textAlign: "center" }}>
            <p className={`time-status-pill ${statusClass}`} key={`st-${me.status}`}>
              {statusLabel(me.status)}
            </p>
          </div>
          {me.status === "CLOCKED_IN" ? (
            <p className="time-sub">{copy.haveAGreatDay(me.employee.preferredName)}</p>
          ) : null}
          {me.status === "CLOCKED_IN" || me.status === "ON_LUNCH" || daySeconds > 0 ? (
            <div className="time-progress" aria-label={copy.dayProgress}>
              <div className="time-progress-label">
                <span>{copy.dayProgress}</span>
                <strong>
                  {dayHoursLabel}
                  <span style={{ fontWeight: 600, color: "var(--jobs-muted)", marginLeft: "0.35rem" }}>
                    · {dayPct}%
                  </span>
                </strong>
              </div>
              <div className="time-progress-track">
                <div className="time-progress-fill" style={{ width: `${dayPct}%` }} />
              </div>
            </div>
          ) : null}
          <dl className="time-hours">
            <div>
              <dt>{copy.todayHours}</dt>
              <dd>{dayHoursLabel}</dd>
            </div>
            <div>
              <dt>{copy.weekHours}</dt>
              <dd>{me.weekHours}</dd>
            </div>
          </dl>
          <button
            className={`time-btn time-btn-primary${punchPulse ? " time-btn-pulse" : ""}${
              primary.type === "clock_out" ? " time-btn-out" : ""
            }`}
            type="button"
            disabled={busy}
            onClick={() => punch(primary.type)}
          >
            {primary.label}
          </button>
          {secondary ? (
            <button
              className="time-btn time-btn-secondary"
              type="button"
              disabled={busy}
              onClick={() => punch(secondary.type)}
            >
              {secondary.label}
            </button>
          ) : null}
          <p className="time-muted" style={{ marginTop: "0.85rem", fontSize: "0.82rem" }}>
            {copy.locationPrivacy}
          </p>
          {receipt ? <p className="time-receipt">{receipt}</p> : null}
        </div>
      ) : null}

      {screen === "history" ? (
        <>
          <h1 className="time-title">Your time</h1>
          <p className="time-muted">You can request a change — you cannot edit the official timecard.</p>
          <ul className="time-list">
            {me.punches
              .slice()
              .reverse()
              .map((p) => (
                <li key={p.id}>
                  <strong>{p.type.replace("_", " ")}</strong>
                  <div className="time-muted">
                    {new Intl.DateTimeFormat("en-US", {
                      timeZone: "America/Chicago",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(p.occurredAt))}
                    {p.sourceLabel ? ` · ${p.sourceLabel}` : ""}
                  </div>
                </li>
              ))}
          </ul>
        </>
      ) : null}

      {screen === "requests" ? (
        <>
          {form === "menu" ? (
            <>
              <h1 className="time-title">Requests</h1>
              <button className="time-btn time-btn-primary" type="button" onClick={() => setForm("fix")}>
                {copy.fixMyTime}
              </button>
              <button className="time-btn time-btn-secondary" type="button" onClick={() => setForm("absence")}>
                {copy.reportAbsence}
              </button>
              <button className="time-btn time-btn-secondary" type="button" onClick={() => setForm("timeoff")}>
                {copy.requestTimeOff}
              </button>
              <ul className="time-list" style={{ marginTop: "1.2rem" }}>
                {me.corrections
                  .filter((c) => c.state === "needs_clarification")
                  .map((c) => (
                    <li key={c.id}>
                      <strong>Shelly needs more info · {c.affectedDate}</strong>
                      <div className="time-muted">{c.adminRemark || c.employeeExplanation}</div>
                      <button type="button" className="time-btn time-btn-secondary" onClick={() => openThread("correction", c.id)}>
                        Reply
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          ) : null}

          {form === "fix" ? (
            <>
              <h1 className="time-title">{copy.fixMyTime}</h1>
              <p className="time-muted">{copy.requestAChange} — Shelly reviews every request.</p>
              <label className="time-field-label">
                Request type
                <select
                  className="time-field"
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value as CorrectionIssueType)}
                >
                  {FIX_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="time-field-label">
                Affected date
                <input className="time-field" type="date" value={affectedDate} onChange={(e) => setAffectedDate(e.target.value)} />
              </label>
              <label className="time-field-label">
                Requested time
                <input
                  className="time-field"
                  placeholder="What should the time be?"
                  value={requested}
                  onChange={(e) => setRequested(e.target.value)}
                />
              </label>
              <label className="time-field-label">
                Employee explanation
                <textarea
                  className="time-field"
                  rows={4}
                  placeholder="What happened?"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                />
              </label>
              <button className="time-btn time-btn-primary" type="button" disabled={busy} onClick={submitFix}>
                {copy.sendRequest}
              </button>
              <button className="time-btn time-btn-secondary" type="button" onClick={() => setForm("menu")}>
                Back
              </button>
            </>
          ) : null}

          {form === "absence" ? (
            <>
              <h1 className="time-title">{copy.reportAbsence}</h1>
              <p className="time-muted">{copy.whyGone}</p>
              <select
                className="time-field"
                value={absReason}
                onChange={(e) => setAbsReason(e.target.value as AbsenceReason)}
              >
                {ABSENCE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <input className="time-field" type="date" value={absStart} onChange={(e) => setAbsStart(e.target.value)} />
              <input className="time-field" type="date" value={absEnd} onChange={(e) => setAbsEnd(e.target.value)} />
              <textarea
                className="time-field"
                rows={3}
                placeholder={copy.absenceNoteHint}
                value={absNote}
                onChange={(e) => setAbsNote(e.target.value)}
              />
              <button className="time-btn time-btn-primary" type="button" disabled={busy} onClick={submitAbsence}>
                {copy.sendRequest}
              </button>
              <button className="time-btn time-btn-secondary" type="button" onClick={() => setForm("menu")}>
                Back
              </button>
            </>
          ) : null}

          {form === "timeoff" ? (
            <>
              <h1 className="time-title">{copy.requestTimeOff}</h1>
              <select
                className="time-field"
                value={offReason}
                onChange={(e) => setOffReason(e.target.value as TimeOffReason)}
              >
                {TIME_OFF_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input className="time-field" type="date" value={offStart} onChange={(e) => setOffStart(e.target.value)} />
              <input className="time-field" type="date" value={offEnd} onChange={(e) => setOffEnd(e.target.value)} />
              <textarea
                className="time-field"
                rows={3}
                placeholder={copy.absenceNoteHint}
                value={offNote}
                onChange={(e) => setOffNote(e.target.value)}
              />
              <button className="time-btn time-btn-primary" type="button" disabled={busy} onClick={submitTimeOff}>
                {copy.sendRequest}
              </button>
              <button className="time-btn time-btn-secondary" type="button" onClick={() => setForm("menu")}>
                Back
              </button>
            </>
          ) : null}

          {form === "done" ? (
            <>
              <h1 className="time-title">Sent</h1>
              <p className="time-sub">{sentMsg}</p>
              <button
                className="time-btn time-btn-primary"
                type="button"
                onClick={() => {
                  setForm("menu");
                  setScreen("home");
                }}
              >
                Done
              </button>
            </>
          ) : null}

          {replyFor ? (
            <div style={{ marginTop: "1rem" }}>
              <h2 className="jobs-display">Conversation</h2>
              <ul className="time-list">
                {thread.map((m, i) => (
                  <li key={i}>
                    <strong>{m.authorRole}</strong>
                    <div className="time-muted">{m.body}</div>
                  </li>
                ))}
              </ul>
              <textarea
                className="time-field"
                rows={3}
                placeholder="Your reply"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <button className="time-btn time-btn-primary" type="button" disabled={busy} onClick={sendReply}>
                Send reply
              </button>
              <button className="time-btn time-btn-secondary" type="button" onClick={() => setReplyFor(null)}>
                Close
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {screen === "leave" ? (
        <>
          <h1 className="time-title">Leave</h1>
          {!me.leaveVisible ? (
            <p className="time-muted">Nothing to show here right now.</p>
          ) : (
            <ul className="time-list">
              {me.leave.map((b) => (
                <li key={b.type}>
                  <strong>{b.type.toUpperCase()}</strong>
                  <div className="time-muted">
                    {b.usedHours} used · {b.grantedHours - b.usedHours} remaining of {b.grantedHours}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {screen === "inbox" ? (
        <>
          <h1 className="time-title">Updates</h1>
          <ul className="time-list">
            {(me.notifications || []).map((n) => (
              <li key={n.id}>
                <strong>{n.title}</strong>
                <div className="time-muted">{n.body}</div>
              </li>
            ))}
          </ul>
          {(me.notifications || []).length === 0 ? <p className="time-muted">No updates yet.</p> : null}
        </>
      ) : null}

      {isTimeAdmin ? (
        <>
          {screen === "home" || screen === "history" || screen === "requests" || screen === "inbox" || screen === "leave" ? (
            <div className="time-admin-self-links">
              <button type="button" onClick={() => setScreen("history")}>My history</button>
              <button
                type="button"
                onClick={() => {
                  setForm("menu");
                  setScreen("requests");
                }}
              >
                Fix My Time / Absence
              </button>
              {me.leaveVisible ? (
                <button type="button" onClick={() => setScreen("leave")}>
                  My leave
                </button>
              ) : null}
              <button type="button" onClick={() => void openInbox()}>
                Updates{me.unreadNotificationCount ? ` (${me.unreadNotificationCount})` : ""}
              </button>
            </div>
          ) : null}
          <nav className="time-nav time-nav-admin">
            <button
              className={
                screen === "home" ||
                screen === "history" ||
                screen === "requests" ||
                screen === "inbox" ||
                screen === "leave"
                  ? "on"
                  : ""
              }
              type="button"
              onClick={() => setScreen("home")}
            >
              My Time
            </button>
            {canReview ? (
              <button className={screen === "admin-review" ? "on" : ""} type="button" onClick={() => setScreen("admin-review")}>
                Review
              </button>
            ) : null}
            {canEmployees ? (
              <button className={screen === "admin-employees" ? "on" : ""} type="button" onClick={() => setScreen("admin-employees")}>
                Employees
              </button>
            ) : null}
            {canReview ? (
              <button className={screen === "admin-leave" ? "on" : ""} type="button" onClick={() => setScreen("admin-leave")}>
                Time Off
              </button>
            ) : null}
            {canPayroll ? (
              <button className={screen === "admin-payroll" ? "on" : ""} type="button" onClick={() => setScreen("admin-payroll")}>
                Payroll
              </button>
            ) : null}
            {canSecurity ? (
              <button className={screen === "admin-security" ? "on" : ""} type="button" onClick={() => setScreen("admin-security")}>
                Security
              </button>
            ) : null}
          </nav>
        </>
      ) : (
        <nav className="time-nav" style={{ gridTemplateColumns: me.leaveVisible ? "repeat(5, 1fr)" : "repeat(4, 1fr)" }}>
          <button className={screen === "home" ? "on" : ""} type="button" onClick={() => setScreen("home")}>
            My Time
          </button>
          <button className={screen === "history" ? "on" : ""} type="button" onClick={() => setScreen("history")}>
            History
          </button>
          <button
            className={screen === "requests" ? "on" : ""}
            type="button"
            onClick={() => {
              setForm("menu");
              setScreen("requests");
            }}
          >
            Fix / Absence
          </button>
          <button className={screen === "inbox" ? "on" : ""} type="button" onClick={() => void openInbox()}>
            Updates{me.unreadNotificationCount ? ` (${me.unreadNotificationCount})` : ""}
          </button>
          {me.leaveVisible ? (
            <button className={screen === "leave" ? "on" : ""} type="button" onClick={() => setScreen("leave")}>
              Time Off
            </button>
          ) : null}
        </nav>
      )}

      <InstallOnboarding
        open={showInstall}
        installPrompt={deferredPrompt}
        onClose={() => setShowInstall(false)}
      />

      {clockOutThanks ? (
        <div
          className="time-thanks"
          role="dialog"
          aria-modal="true"
          aria-label="Thanks for today"
          onClick={() => setClockOutThanks(null)}
        >
          <div className="time-thanks-card" onClick={(e) => e.stopPropagation()}>
            <p className="time-thanks-eyebrow">Clocked out</p>
            <p className="time-thanks-msg">{clockOutThanks}</p>
            <button className="time-btn time-btn-primary" type="button" onClick={() => setClockOutThanks(null)}>
              See you next shift
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
