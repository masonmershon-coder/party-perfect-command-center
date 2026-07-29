"use client";

import { PageHeader, LiveStatusBar } from "@/app/components/dashboard/page-header";
import { MarkRepliedButton, RepliedBadge } from "@/app/components/dashboard/replied-badge";
import { ReplyComposer } from "@/app/components/dashboard/reply-composer";
import { StatusBadge } from "@/app/components/status-badge";
import { TimePeriodFilter } from "@/app/components/dashboard/time-period-filter";
import { isBusinessPriority } from "@/lib/email-priority";
import {
  DEFAULT_TIME_PERIOD,
  isWithinTimePeriod,
  type TimePeriod,
} from "@/lib/time-filter";
import type { EmailAccount, EmailConnectionInfo } from "@/lib/email-accounts";
import type { EmailAccountId, EmailItem, EmailPriority, SanitizedConnection } from "@/lib/types";
import { emailPriorityLabels, emailPriorityStyles, formatTime } from "@/lib/ui";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type PriorityFilter = "all" | "business" | "urgent";

function PriorityBadge({ priority }: { priority: EmailPriority }) {
  return (
    <span className={emailPriorityStyles[priority]}>
      {emailPriorityLabels[priority]}
    </span>
  );
}

export function EmailsSection({
  accounts,
  connection,
  emails,
  connections,
  onConnectAccount,
  onDisconnectAccount,
  onUpdateEmail,
  onDraftReply,
  focusEmailId,
  autoDraftReply = false,
  onFocusConsumed,
  liveModeEnabled = false,
  lastCheckedAt = null,
  isRefreshing = false,
  newItemIds = [],
}: {
  accounts: EmailAccount[];
  connection: EmailConnectionInfo;
  emails: EmailItem[];
  connections: SanitizedConnection[];
  onConnectAccount: (accountKey: EmailAccountId, label: string) => Promise<void>;
  onDisconnectAccount: (accountKey: EmailAccountId) => Promise<void>;
  onUpdateEmail: (
    id: string,
    patch: { status?: EmailItem["status"]; priority?: EmailPriority },
  ) => Promise<void>;
  onDraftReply: (
    id: string,
    input: {
      instructions?: string;
      tone?: "professional" | "friendly" | "concise";
    },
    onChunk: (content: string) => void,
  ) => Promise<string>;
  focusEmailId?: string | null;
  autoDraftReply?: boolean;
  onFocusConsumed?: () => void;
  liveModeEnabled?: boolean;
  lastCheckedAt?: string | null;
  isRefreshing?: boolean;
  newItemIds?: string[];
}) {
  const [activeAccountId, setActiveAccountId] = useState<EmailAccountId>(
    accounts[0]?.id ?? "company",
  );

  useEffect(() => {
    if (!accounts.some((account) => account.id === activeAccountId)) {
      setActiveAccountId(accounts[0]?.id ?? "company");
    }
  }, [accounts, activeAccountId]);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(DEFAULT_TIME_PERIOD);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyInstructions, setReplyInstructions] = useState("");
  const [replyTone, setReplyTone] = useState<
    "professional" | "friendly" | "concise"
  >("professional");
  const [drafting, setDrafting] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeAccount =
    accounts.find((account) => account.id === activeAccountId) ?? accounts[0];

  const visibleEmails = useMemo(() => {
    return emails.filter((email) => {
      if (email.accountId !== activeAccountId) return false;
      if (!isWithinTimePeriod(email.receivedAt, timePeriod)) return false;
      if (showArchived) return email.status === "archived";
      if (email.status === "archived") return false;
      if (priorityFilter === "business") return isBusinessPriority(email.priority);
      if (priorityFilter === "urgent") return email.priority === "urgent";
      return true;
    });
  }, [emails, activeAccountId, showArchived, priorityFilter, timePeriod]);

  const selectedEmail =
    emails.find((email) => email.id === selectedEmailId) ?? null;

  const unreadByAccount = useMemo(() => {
    const counts: Record<EmailAccountId, number> = {
      company: 0,
      josh: 0,
      michelle: 0,
    };

    for (const email of emails) {
      if (email.status === "unread") {
        counts[email.accountId] += 1;
      }
    }

    return counts;
  }, [emails]);

  const businessPriorityCount = useMemo(
    () =>
      emails.filter(
        (email) =>
          email.accountId === activeAccountId &&
          email.status !== "archived" &&
          isBusinessPriority(email.priority),
      ).length,
    [emails, activeAccountId],
  );

  const needsReplyCount = useMemo(
    () =>
      emails.filter(
        (email) =>
          email.accountId === activeAccountId &&
          email.status !== "replied" &&
          email.status !== "archived",
      ).length,
    [emails, activeAccountId],
  );

  const newItemIdSet = useMemo(() => new Set(newItemIds), [newItemIds]);

  useEffect(() => {
    if (
      selectedEmailId &&
      !visibleEmails.some((email) => email.id === selectedEmailId)
    ) {
      setSelectedEmailId(visibleEmails[0]?.id ?? null);
      setReplyDraft("");
    }
  }, [visibleEmails, selectedEmailId]);

  const focusHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusEmailId) {
      focusHandledRef.current = null;
      return;
    }
    if (focusHandledRef.current === focusEmailId) return;

    const email = emails.find((entry) => entry.id === focusEmailId);
    if (!email) return;

    focusHandledRef.current = focusEmailId;
    setActiveAccountId(email.accountId);
    setTimePeriod("all");
    setShowArchived(false);
    setPriorityFilter("all");
    setSelectedEmailId(focusEmailId);
    setReplyDraft("");
    setError(null);

    if (email.status === "unread") {
      void onUpdateEmail(email.id, { status: "read" });
    }

    if (autoDraftReply) {
      void (async () => {
        setDrafting(true);
        try {
          const draft = await onDraftReply(
            email.id,
            { tone: replyTone },
            setReplyDraft,
          );
          setReplyDraft(draft);
        } catch (draftError) {
          setError(
            draftError instanceof Error
              ? draftError.message
              : "Failed to draft reply with Grok.",
          );
        } finally {
          setDrafting(false);
          onFocusConsumed?.();
        }
      })();
    } else {
      onFocusConsumed?.();
    }
  }, [
    focusEmailId,
    autoDraftReply,
    emails,
    onUpdateEmail,
    onDraftReply,
    onFocusConsumed,
    replyTone,
  ]);

  function handleAccountChange(accountId: EmailAccountId) {
    setActiveAccountId(accountId);
    setSelectedEmailId(null);
    setReplyDraft("");
    setPriorityFilter("all");
    setError(null);
  }

  async function handleSelectEmail(email: EmailItem) {
    setSelectedEmailId(email.id);
    setReplyDraft("");
    setError(null);

    if (email.status === "unread") {
      try {
        await onUpdateEmail(email.id, { status: "read" });
      } catch (updateError) {
        setError(
          updateError instanceof Error
            ? updateError.message
            : "Failed to mark email as read.",
        );
      }
    }
  }

  async function handleEmailUpdate(
    id: string,
    patch: { status?: EmailItem["status"]; priority?: EmailPriority },
  ) {
    setUpdating(id);
    setError(null);
    try {
      await onUpdateEmail(id, patch);
      if (patch.status === "archived" && selectedEmailId === id) {
        setSelectedEmailId(null);
        setReplyDraft("");
      }
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update email.",
      );
    } finally {
      setUpdating(null);
    }
  }

  async function handleMarkReplied(id: string) {
    setUpdating(id);
    setError(null);
    try {
      await onUpdateEmail(id, { status: "replied" });
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to mark as replied.",
      );
    } finally {
      setUpdating(null);
    }
  }

  async function handleDraftReply() {
    if (!selectedEmail) return;

    setDrafting(true);
    setReplyDraft("");
    setError(null);

    try {
      const draft = await onDraftReply(
        selectedEmail.id,
        {
          instructions: replyInstructions.trim() || undefined,
          tone: replyTone,
        },
        setReplyDraft,
      );
      setReplyDraft(draft);
    } catch (draftError) {
      setError(
        draftError instanceof Error
          ? draftError.message
          : "Failed to draft reply with Grok.",
      );
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Communications"
        title="Emails"
        description="Three GoDaddy mailboxes — General, Josh, and Michelle — with business priority tracking."
      />

      <LiveStatusBar
        enabled={liveModeEnabled}
        checking={isRefreshing}
        lastCheckedAt={lastCheckedAt}
        isRefreshing={isRefreshing}
      />

      {needsReplyCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--pp-text)]">
              To-Do Inbox
            </p>
            <p className="text-xs text-[var(--pp-text-muted)]">
              {needsReplyCount} message{needsReplyCount === 1 ? "" : "s"} waiting
              for a reply in this mailbox
            </p>
          </div>
          {liveModeEnabled && newItemIds.length > 0 && (
            <span className="rounded-full bg-[var(--pp-accent)] px-3 py-1 text-xs font-semibold text-white pp-live-count-bump">
              +{newItemIds.length} new
            </span>
          )}
        </div>
      )}

      <div className="pp-panel mb-6 rounded-2xl border border-[var(--pp-accent)]/20 bg-[var(--pp-accent-soft)]/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] pp-accent-text">
              GoDaddy Workspace · {connection.imapHost}:{connection.imapPort}
            </p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--pp-text-muted)]">
              {connection.message}
            </p>
            <p className="mt-2 text-xs text-[var(--pp-text-muted)]">
              Passwords belong in{" "}
              <code className="rounded bg-[var(--pp-accent-muted)] px-1 py-0.5">
                .env.local
              </code>{" "}
              only. Connected mailboxes stay signed in via server session +
              browser localStorage.
            </p>
          </div>
          <p className="rounded-full border border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] px-3 py-1 text-xs font-semibold pp-accent-text">
            {connection.configuredAccountCount}/3 mailboxes configured
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {accounts.map((account) => {
          const isActive = account.id === activeAccountId;
          const unread = unreadByAccount[account.id];
          const sessionConnected = connections.some(
            (entry) =>
              entry.type === "email" && entry.accountKey === account.id,
          );

          return (
            <div
              key={account.id}
              className={`rounded-2xl border p-4 transition ${
                isActive
                  ? "border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] shadow-sm"
                  : "border-[var(--pp-border)] bg-[var(--pp-panel)]"
              }`}
            >
              <button
                type="button"
                onClick={() => handleAccountChange(account.id)}
                className="w-full text-left"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-semibold ${
                      isActive ? "pp-accent-text" : "text-[var(--pp-text)]"
                    }`}
                  >
                    {account.label}
                  </span>
                  {unread > 0 && (
                    <span className="rounded-full bg-[var(--pp-accent)] px-2 py-0.5 text-[10px] font-semibold text-white">
                      {unread}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs font-medium text-[var(--pp-text)]">
                  {account.address}
                </p>
                <p className="mt-1 text-xs text-[var(--pp-text-muted)]">
                  {account.description}
                </p>
              </button>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--pp-border)] pt-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                    sessionConnected
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-[var(--pp-accent-muted)] text-[var(--pp-text-muted)]"
                  }`}
                >
                  {sessionConnected ? "Signed in" : "Not signed in"}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                    account.passwordConfigured
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-amber-500/10 text-amber-600"
                  }`}
                >
                  {account.passwordConfigured ? "IMAP in .env" : "Demo inbox"}
                </span>
                {sessionConnected ? (
                  <button
                    type="button"
                    onClick={() => onDisconnectAccount(account.id)}
                    className="text-[10px] font-medium text-[var(--pp-text-muted)] hover:text-red-500"
                  >
                    Sign out
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onConnectAccount(account.id, account.label)}
                    className="text-[10px] font-medium pp-accent-text hover:underline"
                  >
                    Sign in
                  </button>
                )}
                {account.futureLoginPath && (
                  <Link
                    href={account.futureLoginPath}
                    className="text-[10px] font-medium pp-accent-text hover:underline"
                  >
                    Future login →
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <TimePeriodFilter
        value={timePeriod}
        onChange={(period) => {
          setTimePeriod(period);
          setSelectedEmailId(null);
          setReplyDraft("");
        }}
        itemCount={visibleEmails.length}
        itemLabel="emails"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { id: "all", label: "All mail" },
            { id: "business", label: `Business priority (${businessPriorityCount})` },
            { id: "urgent", label: "Urgent only" },
          ] as const
        ).map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setPriorityFilter(filter.id)}
            className={`rounded-full px-4 py-2 text-xs font-medium transition ${
              priorityFilter === filter.id
                ? "bg-[var(--pp-accent)] text-white"
                : "border border-[var(--pp-border)] text-[var(--pp-text-muted)] hover:border-[var(--pp-accent)]"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="pp-panel overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-[var(--pp-border)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--pp-text)]">
              {showArchived ? "Archived" : "Inbox"}
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowArchived((current) => !current);
                setSelectedEmailId(null);
                setReplyDraft("");
              }}
              className="text-xs font-medium pp-accent-text hover:underline"
            >
              {showArchived ? "Back to inbox" : "View archived"}
            </button>
          </div>

          <div className="max-h-[560px] overflow-y-auto">
            {visibleEmails.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--pp-text-muted)]">
                {showArchived
                  ? "No archived emails for this account."
                  : "No emails match this filter."}
              </p>
            ) : (
              visibleEmails.map((email) => {
                const isSelected = email.id === selectedEmailId;
                const isReplied = email.status === "replied";

                return (
                  <div
                    key={email.id}
                    className={`border-b border-[var(--pp-border)] last:border-b-0 ${
                      isSelected ? "bg-[var(--pp-accent-soft)]" : ""
                    } ${newItemIdSet.has(email.id) ? "pp-live-new-item" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectEmail(email)}
                      className={`flex w-full flex-col gap-2 px-4 py-4 text-left transition hover:bg-[var(--pp-nav-hover)] ${
                        isSelected ? "hover:bg-[var(--pp-accent-soft)]" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p
                            className={`truncate text-sm ${
                              email.status === "unread"
                                ? "font-semibold text-[var(--pp-text)]"
                                : "font-medium text-[var(--pp-text)]"
                            }`}
                          >
                            {email.subject}
                          </p>
                          <p className="mt-1 truncate text-xs text-[var(--pp-text-muted)]">
                            {email.sender} · {email.senderEmail}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[11px] text-[var(--pp-text-muted)]">
                            {formatTime(email.receivedAt)}
                          </p>
                          {email.status === "unread" && (
                            <span className="mt-2 inline-block h-2 w-2 rounded-full bg-[var(--pp-accent)]" />
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <PriorityBadge priority={email.priority} />
                        {isReplied && (
                          <RepliedBadge repliedAt={email.repliedAt} />
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs leading-5 text-[var(--pp-text-muted)]">
                        {email.preview}
                      </p>
                    </button>
                    {!isReplied && email.status !== "archived" && (
                      <div className="flex justify-end px-4 pb-3">
                        <MarkRepliedButton
                          compact
                          disabled={updating === email.id}
                          onClick={() => void handleMarkReplied(email.id)}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="pp-panel rounded-2xl p-5">
          {!selectedEmail ? (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center">
              <p className="text-4xl text-[var(--pp-accent)]">✉</p>
              <p className="mt-4 text-sm font-medium text-[var(--pp-text)]">
                Select an email to read
              </p>
              <p className="mt-1 max-w-sm text-xs text-[var(--pp-text-muted)]">
                Business-priority messages (quotes, bookings, contracts) are
                tagged and sorted to the top.
              </p>
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col">
              <div className="border-b border-[var(--pp-border)] pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--pp-text)]">
                      {selectedEmail.subject}
                    </h3>
                    <p className="mt-2 text-sm text-[var(--pp-text-muted)]">
                      From{" "}
                      <span className="font-medium text-[var(--pp-text)]">
                        {selectedEmail.sender}
                      </span>{" "}
                      &lt;{selectedEmail.senderEmail}&gt;
                    </p>
                    <p className="mt-1 text-xs text-[var(--pp-text-muted)]">
                      {formatTime(selectedEmail.receivedAt)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {selectedEmail.status === "replied" ? (
                      <RepliedBadge repliedAt={selectedEmail.repliedAt} />
                    ) : (
                      <StatusBadge status={selectedEmail.status} kind="inbox" />
                    )}
                    <PriorityBadge priority={selectedEmail.priority} />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-[var(--pp-text-muted)]">
                    Priority
                  </label>
                  <select
                    value={selectedEmail.priority}
                    disabled={updating === selectedEmail.id}
                    onChange={(event) =>
                      handleEmailUpdate(selectedEmail.id, {
                        priority: event.target.value as EmailPriority,
                      })
                    }
                    className="pp-input px-3 py-1.5 text-xs"
                  >
                    {(
                      ["urgent", "business", "general", "low"] as EmailPriority[]
                    ).map((priority) => (
                      <option key={priority} value={priority}>
                        {emailPriorityLabels[priority]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedEmail.status !== "replied" &&
                    selectedEmail.status !== "archived" && (
                      <MarkRepliedButton
                        disabled={updating === selectedEmail.id}
                        onClick={() =>
                          void handleMarkReplied(selectedEmail.id)
                        }
                      />
                    )}
                  {selectedEmail.status !== "read" &&
                    selectedEmail.status !== "replied" && (
                      <button
                        type="button"
                        disabled={updating === selectedEmail.id}
                        onClick={() =>
                          handleEmailUpdate(selectedEmail.id, { status: "read" })
                        }
                        className="rounded-lg border border-[var(--pp-accent)] px-3 py-1.5 text-xs font-medium pp-accent-text transition hover:bg-[var(--pp-accent-soft)]"
                      >
                        Mark as read
                      </button>
                    )}
                  {selectedEmail.status !== "archived" && (
                    <button
                      type="button"
                      disabled={updating === selectedEmail.id}
                      onClick={() =>
                        handleEmailUpdate(selectedEmail.id, {
                          status: "archived",
                        })
                      }
                      className="rounded-lg border border-[var(--pp-border)] px-3 py-1.5 text-xs font-medium text-[var(--pp-text-muted)] transition hover:border-[var(--pp-accent)] hover:pp-accent-text"
                    >
                      Archive
                    </button>
                  )}
                  {selectedEmail.status === "archived" && (
                    <button
                      type="button"
                      disabled={updating === selectedEmail.id}
                      onClick={() =>
                        handleEmailUpdate(selectedEmail.id, { status: "read" })
                      }
                      className="rounded-lg border border-[var(--pp-border)] px-3 py-1.5 text-xs font-medium text-[var(--pp-text-muted)] transition hover:border-[var(--pp-accent)] hover:pp-accent-text"
                    >
                      Move to inbox
                    </button>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto py-4">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-[var(--pp-text)]">
                  {selectedEmail.body}
                </pre>
              </div>

              <ReplyComposer
                channelName="your email client (GoDaddy)"
                successMessage="Reply copied — paste into Email"
                draft={replyDraft}
                onDraftChange={setReplyDraft}
                instructions={replyInstructions}
                onInstructionsChange={setReplyInstructions}
                tone={replyTone}
                onToneChange={setReplyTone}
                drafting={drafting}
                onDraftWithGrok={handleDraftReply}
                onSendReply={async () => {
                  await onUpdateEmail(selectedEmail.id, { status: "replied" });
                }}
                instructionsPlaceholder="Optional instructions for Grok (e.g. include quote timeline, mention delivery fee)"
                draftPlaceholder="Draft your reply here, or let Grok write a professional response…"
              />
            </div>
          )}
        </section>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
