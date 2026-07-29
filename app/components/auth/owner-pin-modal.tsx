"use client";

import { getAuthLockoutMessage, unlockOwnerWithPin } from "@/lib/auth";
import { useEffect, useRef, useState } from "react";

export function OwnerPinModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    setDigits(["", "", "", ""]);
    setError(null);
    setSubmitting(false);
    window.setTimeout(() => inputRefs.current[0]?.focus(), 50);
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

  async function submitPin(nextDigits: string[]) {
    const lockout = getAuthLockoutMessage();
    if (lockout) {
      setError(lockout);
      return;
    }

    const pin = nextDigits.join("");
    if (pin.length !== 4) return;

    setSubmitting(true);
    setError(null);
    try {
      const ok = await unlockOwnerWithPin(pin);
      if (!ok) {
        setError("Incorrect admin code.");
        setDigits(["", "", "", ""]);
        inputRefs.current[0]?.focus();
        return;
      }
      onSuccess();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  function updateDigit(index: number, value: string) {
    const next = value.replace(/\D/g, "").slice(-1);
    const updated = [...digits];
    updated[index] = next;
    setDigits(updated);
    setError(null);

    if (next && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    if (updated.every((digit) => digit.length === 1)) {
      void submitPin(updated);
    }
  }

  function handleKeyDown(
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-pin-title"
      onClick={onClose}
    >
      <div
        className="pp-panel w-full max-w-sm p-6"
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
        <p className="mt-2 text-sm text-[var(--pp-text-muted)]">
          Bookkeeping, marketing, and reports are protected for internal
          owners only.
        </p>

        <div className="mt-6 flex justify-center gap-3">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputRefs.current[index] = element;
              }}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              disabled={submitting}
              onChange={(event) => updateDigit(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              className="h-14 w-12 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-input-bg)] text-center text-xl font-semibold text-[var(--pp-text)] outline-none transition focus:border-[var(--pp-accent)] focus:ring-2 focus:ring-[var(--pp-accent)]/20"
              aria-label={`Admin code digit ${index + 1}`}
            />
          ))}
        </div>

        {error && (
          <p className="mt-4 text-center text-sm text-red-600">{error}</p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--pp-border)] px-4 py-2.5 text-sm font-medium text-[var(--pp-text-muted)] transition hover:bg-[var(--pp-nav-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || digits.some((digit) => !digit)}
            onClick={() => void submitPin(digits)}
            className="pp-btn-primary flex-1 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Checking…" : "Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}
