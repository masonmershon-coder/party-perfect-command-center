"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TimeCapability } from "@/lib/time/types";
import { canUseTimeAdmin } from "@/app/time/time-admin";

const HOLD_MS = 4000;

type Props = {
  capabilities: TimeCapability[];
  appVersion: string;
  onSignedOut: () => void;
};

/**
 * Discreet logo hold (4s) opens ADMIN / SUPPORT ACCESS.
 * Ordinary employees only see diagnostics — never Switch Account / admin tools.
 */
export function TimeLogoSupportGate({ capabilities, appVersion, onSignedOut }: Props) {
  const [open, setOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const [holdPct, setHoldPct] = useState(0);
  const [diag, setDiag] = useState<{
    online: boolean;
    location: string;
    standalone: boolean;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(0);
  const isAdmin = canUseTimeAdmin(capabilities);

  const clearHold = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (tick.current) clearInterval(tick.current);
    timer.current = null;
    tick.current = null;
    setHolding(false);
    setHoldPct(0);
  }, []);

  const startHold = useCallback(() => {
    clearHold();
    setHolding(true);
    started.current = Date.now();
    tick.current = setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - started.current) / HOLD_MS) * 100));
      setHoldPct(pct);
    }, 50);
    timer.current = setTimeout(() => {
      clearHold();
      setOpen(true);
      const loc =
        typeof navigator === "undefined" || !("permissions" in navigator)
          ? "unknown"
          : "checking…";
      setDiag({
        online: typeof navigator !== "undefined" ? navigator.onLine : true,
        location: loc,
        standalone:
          typeof window !== "undefined" &&
          (window.matchMedia("(display-mode: standalone)").matches ||
            // @ts-expect-error iOS Safari
            Boolean(window.navigator.standalone)),
      });
      if (typeof navigator !== "undefined" && "permissions" in navigator) {
        void navigator.permissions
          .query({ name: "geolocation" as PermissionName })
          .then((r) =>
            setDiag((d) => (d ? { ...d, location: r.state } : d)),
          )
          .catch(() =>
            setDiag((d) => (d ? { ...d, location: "unavailable" } : d)),
          );
      }
    }, HOLD_MS);
  }, [clearHold]);

  useEffect(() => () => clearHold(), [clearHold]);

  const switchAccount = async () => {
    if (!isAdmin) return;
    await fetch("/api/time/session", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearDevice: true }),
    });
    setOpen(false);
    onSignedOut();
  };

  const signOutDevice = async () => {
    if (!isAdmin) return;
    await fetch("/api/time/session", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearDevice: true }),
    });
    setOpen(false);
    onSignedOut();
  };

  return (
    <>
      <button
        type="button"
        className="time-logo-hold"
        aria-label="Party Perfect"
        onPointerDown={startHold}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
        onContextMenu={(e) => e.preventDefault()}
      >
        <img className="time-logo" src="/party-perfect-logo.png" alt="" draggable={false} />
        {holding ? (
          <span className="time-logo-hold-ring" style={{ ["--hold" as string]: `${holdPct}%` }} />
        ) : null}
      </button>

      {open ? (
        <div className="time-support-sheet" role="dialog" aria-label="Admin / Support Access">
          <div className="time-support-card">
            <h2>Admin / Support Access</h2>
            <p className="time-muted">
              {isAdmin
                ? "Authorized Time administration tools for this device."
                : "Diagnostics only. This account cannot use admin controls."}
            </p>
            <ul className="time-support-list">
              <li>
                <strong>App version</strong>
                <span>{appVersion}</span>
              </li>
              <li>
                <strong>Connection</strong>
                <span>{diag?.online ? "Online" : "Offline"}</span>
              </li>
              <li>
                <strong>Location permission</strong>
                <span>{diag?.location || "—"}</span>
              </li>
              <li>
                <strong>Home Screen mode</strong>
                <span>{diag?.standalone ? "Installed" : "Browser tab"}</span>
              </li>
              <li>
                <strong>Device status</strong>
                <span>Trusted personal device (not IP-based)</span>
              </li>
            </ul>

            {isAdmin ? (
              <div className="time-support-actions">
                <button type="button" className="time-btn" onClick={() => void switchAccount()}>
                  Switch Account
                </button>
                <button type="button" className="time-btn" onClick={() => void signOutDevice()}>
                  Sign Out This Device
                </button>
                <p className="time-muted" style={{ fontSize: "0.85rem" }}>
                  Reset Trusted Device / restart onboarding is available in Employees admin
                  (Shelly / Mason / Michelle).
                </p>
              </div>
            ) : (
              <p className="time-muted" style={{ fontSize: "0.85rem" }}>
                Need a new phone or PIN help? Ask Shelly, Mason, or Michelle.
              </p>
            )}

            <button
              type="button"
              className="time-btn time-btn-primary"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
