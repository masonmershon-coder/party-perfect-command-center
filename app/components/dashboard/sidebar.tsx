"use client";

import { PartyPerfectLogo } from "@/app/components/dashboard/party-perfect-logo";
import type { NavSection } from "@/lib/types";
import type { UserRole } from "@/lib/user-roles";
import { canAccessSection } from "@/lib/user-roles";
import { navItems } from "@/lib/ui";

export type SidebarReplyCounts = {
  emails: { unread: number; needsReply: number };
  social: { unread: number; needsReply: number };
};

export function Sidebar({
  activeSection,
  onNavigate,
  replyCounts,
  userRole,
  ownerUnlocked,
  onRequestOwner,
}: {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  replyCounts?: SidebarReplyCounts;
  userRole: UserRole;
  ownerUnlocked: boolean;
  onRequestOwner: () => void;
}) {
  function replyLabel(section: "emails" | "social") {
    if (!replyCounts) return null;
    const { unread, needsReply } = replyCounts[section];
    if (needsReply === 0 && unread === 0) return null;
    return `${unread} unread · ${needsReply} need reply`;
  }

  const visibleItems = navItems.filter((item) => {
    if (!item.ownerOnly) return true;
    return ownerUnlocked && canAccessSection(userRole, item.id);
  });

  const lockedOwnerItems = navItems.filter(
    (item) => item.ownerOnly && !ownerUnlocked,
  );

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--pp-border)] bg-[var(--pp-sidebar)] lg:w-72">
      <div className="border-b border-[var(--pp-border)] px-5 py-6">
        <button
          type="button"
          onClick={() => onNavigate("dashboard")}
          className="group flex w-full flex-col items-center rounded-xl px-2 py-3 transition hover:bg-[var(--pp-nav-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pp-accent)]"
          aria-label="Party Perfect — return to Dashboard"
        >
          <PartyPerfectLogo
            variant="sidebar"
            className="transition duration-200 group-hover:opacity-90"
          />
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.22em] pp-accent-text">
            Tulsa Command Center
          </p>
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--pp-text-muted)]">
          Menu
        </p>
        {visibleItems.map((item) => {
          const isActive = activeSection === item.id;
          const sublabel =
            item.id === "emails" || item.id === "social"
              ? replyLabel(item.id)
              : null;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                isActive
                  ? "pp-nav-active"
                  : "text-[var(--pp-text-muted)] hover:bg-[var(--pp-nav-hover)] hover:text-[var(--pp-text)]"
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${
                  isActive
                    ? "bg-[var(--pp-accent)] text-white"
                    : "bg-[var(--pp-accent-muted)] text-[var(--pp-text-muted)]"
                }`}
              >
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">{item.label}</span>
                {sublabel && (
                  <span
                    className={`mt-0.5 block truncate text-[10px] font-normal ${
                      replyCounts![item.id as "emails" | "social"].needsReply > 0
                        ? "text-[var(--pp-accent)]"
                        : "text-[var(--pp-text-muted)]"
                    }`}
                  >
                    {sublabel}
                  </span>
                )}
              </span>
              {sublabel &&
                replyCounts![item.id as "emails" | "social"].needsReply > 0 && (
                  <span className="shrink-0 rounded-full bg-[var(--pp-accent)] px-2 py-0.5 text-[10px] font-bold text-white">
                    {replyCounts![item.id as "emails" | "social"].needsReply}
                  </span>
                )}
            </button>
          );
        })}

        {lockedOwnerItems.length > 0 && (
          <>
            <p className="px-3 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--pp-text-muted)]">
              Admin
            </p>
            {lockedOwnerItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={onRequestOwner}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--pp-text-muted)] transition hover:bg-[var(--pp-nav-hover)] hover:text-[var(--pp-text)]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--pp-accent-muted)] text-sm text-[var(--pp-text-muted)]">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">{item.label}</span>
                  <span className="mt-0.5 block text-[10px] font-normal text-[var(--pp-text-muted)]">
                    Owner code required
                  </span>
                </span>
                <span className="text-xs" aria-hidden>
                  🔒
                </span>
              </button>
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-[var(--pp-border)] p-4">
        <p className="text-center text-[10px] uppercase tracking-[0.16em] text-[var(--pp-text-muted)]">
          Powered by Grok AI
        </p>
      </div>
    </aside>
  );
}
