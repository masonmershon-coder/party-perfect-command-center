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
  mobileOpen = false,
  onMobileClose,
}: {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  replyCounts?: SidebarReplyCounts;
  userRole: UserRole;
  ownerUnlocked: boolean;
  onRequestOwner: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
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

  function go(section: NavSection) {
    onNavigate(section);
    onMobileClose?.();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close menu backdrop"
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onMobileClose}
      />

      {/* Phone/tablet: off-canvas drawer. Desktop (lg+): permanent sidebar. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(100vw-2.5rem,20rem)] flex-col border-r border-[var(--pp-border)] bg-[var(--pp-sidebar)] shadow-2xl transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-72 lg:translate-x-0 lg:shadow-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="border-b border-[var(--pp-border)] px-5 py-5 lg:py-6">
          <div className="mb-2 flex items-center justify-between lg:hidden">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--pp-text-muted)]">
              Menu
            </p>
            <button
              type="button"
              onClick={onMobileClose}
              className="rounded-lg border border-[var(--pp-border)] px-3 py-1.5 text-sm text-[var(--pp-text)]"
              aria-label="Close menu"
            >
              Close
            </button>
          </div>
          <button
            type="button"
            onClick={() => go("dashboard")}
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

        <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-3">
          <p className="hidden px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--pp-text-muted)] lg:block">
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
                onClick={() => go(item.id)}
                className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base font-medium transition lg:min-h-0 lg:py-2.5 lg:text-sm ${
                  isActive
                    ? "pp-nav-active"
                    : "text-[var(--pp-text-muted)] hover:bg-[var(--pp-nav-hover)] hover:text-[var(--pp-text)]"
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base lg:h-8 lg:w-8 lg:text-sm ${
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
                        replyCounts![item.id as "emails" | "social"]
                          .needsReply > 0
                          ? "text-[var(--pp-accent)]"
                          : "text-[var(--pp-text-muted)]"
                      }`}
                    >
                      {sublabel}
                    </span>
                  )}
                </span>
                {sublabel &&
                  replyCounts![item.id as "emails" | "social"].needsReply >
                    0 && (
                    <span className="shrink-0 rounded-full bg-[var(--pp-accent)] px-2 py-0.5 text-[10px] font-bold text-white">
                      {
                        replyCounts![item.id as "emails" | "social"]
                          .needsReply
                      }
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
                  onClick={() => {
                    onRequestOwner();
                    onMobileClose?.();
                  }}
                  className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base font-medium text-[var(--pp-text-muted)] transition hover:bg-[var(--pp-nav-hover)] hover:text-[var(--pp-text)] lg:min-h-0 lg:py-2.5 lg:text-sm"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--pp-accent-muted)] text-base text-[var(--pp-text-muted)] lg:h-8 lg:w-8 lg:text-sm">
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
    </>
  );
}

/** Quick jump bar for phones — primary day-to-day tabs. */
export function MobileBottomNav({
  activeSection,
  onNavigate,
  onOpenMenu,
  emailNeedsReply = 0,
  socialNeedsReply = 0,
}: {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  onOpenMenu: () => void;
  emailNeedsReply?: number;
  socialNeedsReply?: number;
}) {
  const items: {
    id: NavSection | "menu";
    label: string;
    icon: string;
    badge?: number;
  }[] = [
    { id: "dashboard", label: "Home", icon: "▦" },
    { id: "design", label: "Design", icon: "◐" },
    {
      id: "emails",
      label: "Email",
      icon: "✉",
      badge: emailNeedsReply > 0 ? emailNeedsReply : undefined,
    },
    {
      id: "social",
      label: "Social",
      icon: "✦",
      badge: socialNeedsReply > 0 ? socialNeedsReply : undefined,
    },
    { id: "menu", label: "More", icon: "☰" },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--pp-border)] bg-[var(--pp-header-bg)] px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur-xl lg:hidden"
      aria-label="Mobile shortcuts"
    >
      <div className="grid grid-cols-5 gap-0.5">
        {items.map((item) => {
          const isActive = item.id !== "menu" && activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === "menu") onOpenMenu();
                else onNavigate(item.id);
              }}
              className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2.5 text-[10px] font-medium ${
                isActive
                  ? "text-[var(--pp-accent)]"
                  : "text-[var(--pp-text-muted)]"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span>{item.label}</span>
              {item.badge != null && (
                <span className="absolute right-1.5 top-1 rounded-full bg-[var(--pp-accent)] px-1.5 text-[9px] font-bold text-white">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
