"use client";

import { LiveModeToggle } from "@/app/components/dashboard/live-mode-toggle";
import { LiveMikeStatus } from "@/app/components/dashboard/live-mike-status";
import { UserRoleSwitcher } from "@/app/components/dashboard/user-role-switcher";
import { PartyPerfectLogo } from "@/app/components/dashboard/party-perfect-logo";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { BRAND } from "@/lib/brand";
import { formatTime } from "@/lib/ui";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] pp-accent-text">
          {eyebrow}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--pp-text)] md:text-3xl">
            {title}
          </h2>
          {description && (
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--pp-text-muted)]">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="pp-divider mt-6" />
    </div>
  );
}

export function LiveStatusBar({
  enabled,
  checking,
  lastCheckedAt,
  isRefreshing,
}: {
  enabled: boolean;
  checking: boolean;
  lastCheckedAt: string | null;
  isRefreshing?: boolean;
}) {
  if (!enabled) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-panel)] px-4 py-2.5 text-xs text-[var(--pp-text-muted)]">
        <span className="h-2 w-2 rounded-full bg-[var(--pp-text-muted)]/40" />
        Live Mode off — manual refresh only
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--pp-accent)]/25 bg-[var(--pp-accent-soft)]/40 px-4 py-2.5">
      <div className="flex items-center gap-2 text-xs text-[var(--pp-text)]">
        <span
          className={`h-2 w-2 rounded-full bg-[var(--pp-accent)] ${
            checking || isRefreshing ? "pp-live-pulse-dot" : ""
          }`}
        />
        <span className="font-medium pp-accent-text">Live</span>
        <span className="text-[var(--pp-text-muted)]">
          {checking || isRefreshing
            ? "Mike is checking for updates…"
            : lastCheckedAt
              ? `Updated ${formatTime(lastCheckedAt)}`
              : "Watching inbox & social"}
        </span>
      </div>
      <span className="text-[10px] uppercase tracking-wider text-[var(--pp-text-muted)]">
        Auto-refresh · ~70s
      </span>
    </div>
  );
}

export function CommandCenterHeader({
  liveModeEnabled,
  onLiveModeChange,
  mikeChecking,
  lastLiveCheckAt,
  userRole,
  onUserRoleChange,
}: {
  liveModeEnabled: boolean;
  onLiveModeChange: (enabled: boolean) => void;
  mikeChecking: boolean;
  lastLiveCheckAt: string | null;
  userRole: "owner" | "employee";
  onUserRoleChange: (role: "owner" | "employee") => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--pp-border)] bg-[var(--pp-header-bg)] px-6 py-4 backdrop-blur-xl lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <PartyPerfectLogo variant="compact" className="hidden sm:block" />
          <div className="hidden h-8 w-px bg-[var(--pp-border)] md:block" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] pp-accent-text">
              {BRAND.location}
            </p>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--pp-text)] md:text-xl">
              {BRAND.commandCenter}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <UserRoleSwitcher role={userRole} onChange={onUserRoleChange} />
          <LiveMikeStatus
            enabled={liveModeEnabled}
            checking={mikeChecking}
            lastCheckedAt={lastLiveCheckAt}
          />
          <LiveModeToggle
            enabled={liveModeEnabled}
            onChange={onLiveModeChange}
          />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
