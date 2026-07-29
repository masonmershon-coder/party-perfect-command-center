"use client";

import { PartyPerfectLogo } from "@/app/components/dashboard/party-perfect-logo";
import { getAuthLockoutMessage, signInWithPassword } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { useState } from "react";

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const lockout = getAuthLockoutMessage();
    if (lockout) {
      setError(lockout);
      return;
    }

    setSubmitting(true);
    try {
      const ok = await signInWithPassword(password);
      if (!ok) {
        setError("Incorrect password. Please try again.");
        setPassword("");
        return;
      }
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--pp-bg)] px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        aria-hidden
      >
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-[var(--pp-accent)]/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-[var(--pp-accent)]/8 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="pp-panel overflow-hidden">
          <div className="border-b border-[var(--pp-border)] bg-gradient-to-br from-[var(--pp-accent-soft)]/60 to-transparent px-8 py-10 text-center">
            <PartyPerfectLogo variant="sidebar" className="mx-auto" />
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.28em] pp-accent-text">
              {BRAND.location} · Command Center
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--pp-text)]">
              Team sign in
            </h1>
            <p className="mt-2 text-sm text-[var(--pp-text-muted)]">
              Internal access for Party Perfect operations
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 px-8 py-8">
            <div>
              <label
                htmlFor="pp-login-password"
                className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--pp-text-muted)]"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="pp-login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter team password"
                  className="w-full rounded-xl border border-[var(--pp-border)] bg-[var(--pp-input-bg)] px-4 py-3 pr-12 text-sm text-[var(--pp-text)] outline-none transition focus:border-[var(--pp-accent)] focus:ring-2 focus:ring-[var(--pp-accent)]/20"
                  disabled={submitting}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--pp-text-muted)] hover:text-[var(--pp-accent)]"
                  tabIndex={-1}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !password.trim()}
              className="pp-btn-primary w-full px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Signing in…" : "Enter Command Center"}
            </button>
          </form>

          <div className="border-t border-[var(--pp-border)] px-8 py-4 text-center text-[11px] text-[var(--pp-text-muted)]">
            Owner sections require a separate admin code after sign-in.
          </div>
        </div>
      </div>
    </div>
  );
}
