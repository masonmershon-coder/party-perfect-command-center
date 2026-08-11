"use client";

import { getAuthLockoutMessage, unlockOwnerWithPin } from "@/lib/auth";
import { useEffect, useRef, useState } from "react";

const PIN_LENGTH = 6;

export function OwnerPinModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setPin("");
    setError(null);
    setSubmitting(false);
    // Safari iOS: slight delay so the keyboard/input is visible above the fold.
    window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: false });
      inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function submitPin(value: string) {
    const lockout = getAuthLockoutMessage();
    if (lockout) {
      setError(lockout);
      return;
    }

    const digits = value.replace(/\D/g, "");
    if (digits.length !== PIN_LENGTH) {
      setError(`Enter the ${PIN_LENGTH}-digit admin code.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const ok = await unlockOwnerWithPin(digits);
      if (!ok) {
        setError("Incorrect admin code.");
        setPin("");
        inputRef.current?.focus();
        return;
      }
      onSuccess();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  function onPinChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, PIN_LENGTH);
    setPin(digits);
    setError(null);
    if (digits.length === PIN_LENGTH) {
      void submitPin(digits);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto bg-black/50 px-4 py-6 backdrop-blur-sm sm:items-center sm:py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-pin-title"
      onClick={onClose}
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div
        className="pp-panel mb-[max(1rem,env(safe-area-inset-bottom))] w-full max-w-sm p-5 sm:mb-0 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] pp-accent-text">
          Owner access
        </p>
        <h2
          id="owner-pin-title"
          className="mt-2 text-xl font-semibold text-[var(--pp-text)]"
        >
          Enter admin code
        </h2>
        <p className="mt-2 text-sm leading-5 text-[var(--pp-text-muted)]">
          Unlock revenue, AR, rates, bookkeeping, marketing, and reports with
          your {PIN_LENGTH}-digit owner code.
        </p>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-[var(--pp-text-muted)]">
            {PIN_LENGTH}-digit code
          </span>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={PIN_LENGTH}
            value={pin}
            disabled={submitting}
            placeholder={"•".repeat(PIN_LENGTH)}
            onChange={(event) => onPinChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitPin(pin);
              }
            }}
            className="w-full rounded-xl border border-[var(--pp-border)] bg-[var(--pp-input-bg)] px-4 py-3.5 text-center text-2xl font-semibold tracking-[0.35em] text-[var(--pp-text)] outline-none transition focus:border-[var(--pp-accent)] focus:ring-2 focus:ring-[var(--pp-accent)]/20"
            aria-label={`${PIN_LENGTH}-digit admin code`}
          />
        </label>
        <p className="mt-2 text-center text-xs text-[var(--pp-text-muted)]">
          {pin.length}/{PIN_LENGTH} entered
        </p>

        {error && (
          <p className="mt-3 text-center text-sm text-red-600">{error}</p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--pp-border)] px-4 py-2.5 text-sm font-medium text-[var(--pp-text-muted)] transition hover:bg-[var(--pp-nav-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || pin.length !== PIN_LENGTH}
            onClick={() => void submitPin(pin)}
            className="pp-btn-primary flex-1 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Checking…" : "Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}
