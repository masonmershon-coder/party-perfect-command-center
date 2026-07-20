"use client";

import { CatchUpPanel } from "@/app/components/dashboard/catch-up-panel";
import { PageHeader, LiveStatusBar } from "@/app/components/dashboard/page-header";
import { MarkRepliedButton, RepliedBadge } from "@/app/components/dashboard/replied-badge";
import { ReplyComposer } from "@/app/components/dashboard/reply-composer";
import { TimePeriodFilter } from "@/app/components/dashboard/time-period-filter";
import type { MetaConnectionInfo, SocialAccount } from "@/lib/social-accounts";
import {
  DEFAULT_TIME_PERIOD,
  isWithinTimePeriod,
  type TimePeriod,
} from "@/lib/time-filter";
import type {
  CatchUpItem,
  SanitizedConnection,
  SocialComment,
  SocialDirectMessage,
  SocialEngagementSummary,
  SocialInteractionStatus,
  SocialPlatform,
  SocialPost,
} from "@/lib/types";
import { formatTime } from "@/lib/ui";
import { useEffect, useMemo, useRef, useState } from "react";

type SocialTab = "posts" | "comments" | "messages";

function platformIcon(platform: SocialPlatform) {
  return platform === "facebook" ? "f" : "◎";
}

export function SocialSection({
  accounts,
  connection,
  oauthUrls,
  engagement,
  posts,
  comments,
  messages,
  connections,
  onConnect,
  onDisconnect,
  onUpdateItem,
  onDraftReply,
  focusCommentId,
  autoDraftReply = false,
  onFocusConsumed,
  onCatchUpOpen,
  onAskMadison,
  liveModeEnabled = false,
  lastCheckedAt = null,
  isRefreshing = false,
  newItemIds = [],
}: {
  accounts: SocialAccount[];
  connection: MetaConnectionInfo;
  oauthUrls: Record<SocialPlatform, string | null>;
  engagement: SocialEngagementSummary[];
  posts: SocialPost[];
  comments: SocialComment[];
  messages: SocialDirectMessage[];
  connections: SanitizedConnection[];
  onConnect: (platform: SocialPlatform, oauthUrl: string | null) => Promise<void>;
  onDisconnect: (platform: SocialPlatform) => Promise<void>;
  onUpdateItem: (
    kind: "comments" | "messages",
    id: string,
    status: SocialInteractionStatus,
  ) => Promise<void>;
  onDraftReply: (
    kind: "comments" | "messages",
    id: string,
    input: {
      instructions?: string;
      tone?: "professional" | "friendly" | "concise";
    },
    onChunk: (content: string) => void,
  ) => Promise<string>;
  focusCommentId?: string | null;
  autoDraftReply?: boolean;
  onFocusConsumed?: () => void;
  onCatchUpOpen: (item: CatchUpItem, draftReply: boolean) => void;
  onAskMadison?: () => void;
  liveModeEnabled?: boolean;
  lastCheckedAt?: string | null;
  isRefreshing?: boolean;
  newItemIds?: string[];
}) {
  const [activeTab, setActiveTab] = useState<SocialTab>("comments");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(DEFAULT_TIME_PERIOD);
  const [activePlatform, setActivePlatform] = useState<SocialPlatform | "all">(
    "all",
  );
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(
    null,
  );
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );
  const [replyDraft, setReplyDraft] = useState("");
  const [replyInstructions, setReplyInstructions] = useState("");
  const [replyTone, setReplyTone] = useState<
    "professional" | "friendly" | "concise"
  >("friendly");
  const [drafting, setDrafting] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const newItemIdSet = useMemo(() => new Set(newItemIds), [newItemIds]);

  const needsReplyComments = useMemo(
    () =>
      comments.filter(
        (comment) =>
          comment.status !== "replied" && comment.status !== "archived",
      ).length,
    [comments],
  );

  const connectedPlatforms = useMemo(
    () =>
      new Set(
        connections
          .filter((entry) => entry.type === "social")
          .map((entry) => entry.accountKey as SocialPlatform),
      ),
    [connections],
  );

  const filteredComments = useMemo(
    () =>
      comments.filter(
        (comment) =>
          isWithinTimePeriod(comment.createdAt, timePeriod) &&
          (activePlatform === "all" || comment.platform === activePlatform),
      ),
    [comments, activePlatform, timePeriod],
  );

  const filteredMessages = useMemo(
    () =>
      messages.filter(
        (message) =>
          isWithinTimePeriod(message.receivedAt, timePeriod) &&
          (activePlatform === "all" || message.platform === activePlatform),
      ),
    [messages, activePlatform, timePeriod],
  );

  const filteredPosts = useMemo(
    () =>
      posts.filter(
        (post) =>
          isWithinTimePeriod(post.publishedAt, timePeriod) &&
          (activePlatform === "all" || post.platform === activePlatform),
      ),
    [posts, activePlatform, timePeriod],
  );

  const timeFilteredItemCount =
    activeTab === "comments"
      ? filteredComments.length
      : activeTab === "messages"
        ? filteredMessages.length
        : filteredPosts.length;

  const timeFilteredItemLabel =
    activeTab === "comments"
      ? "comments"
      : activeTab === "messages"
        ? "messages"
        : "posts";

  const selectedComment =
    comments.find((comment) => comment.id === selectedCommentId) ?? null;
  const selectedMessage =
    messages.find((message) => message.id === selectedMessageId) ?? null;

  const replyChannelName = selectedComment
    ? selectedComment.platform === "facebook"
      ? "Facebook"
      : "Instagram"
    : selectedMessage
      ? selectedMessage.platform === "facebook"
        ? "Facebook"
        : "Instagram"
      : "Facebook / Instagram";

  const unreadComments = comments.filter((c) => c.status === "unread").length;
  const unreadMessages = messages.filter((m) => m.status === "unread").length;

  const focusHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusCommentId) {
      focusHandledRef.current = null;
      return;
    }
    if (focusHandledRef.current === focusCommentId) return;

    const comment = comments.find((entry) => entry.id === focusCommentId);
    if (!comment) return;

    focusHandledRef.current = focusCommentId;
    setActiveTab("comments");
    setTimePeriod("all");
    setActivePlatform(comment.platform);
    setSelectedCommentId(focusCommentId);
    setSelectedMessageId(null);
    setReplyDraft("");
    setError(null);

    if (autoDraftReply) {
      void (async () => {
        setDrafting(true);
        try {
          const draft = await onDraftReply(
            "comments",
            comment.id,
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
    focusCommentId,
    autoDraftReply,
    comments,
    onDraftReply,
    onFocusConsumed,
    replyTone,
  ]);

  async function handleMarkReplied(
    kind: "comments" | "messages",
    id: string,
  ) {
    setUpdating(id);
    setError(null);
    try {
      await onUpdateItem(kind, id, "replied");
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

  async function handleDraftReply(kind: "comments" | "messages", id: string) {
    setDrafting(true);
    setReplyDraft("");
    setError(null);
    try {
      const draft = await onDraftReply(
        kind,
        id,
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
        eyebrow="Social"
        title="Social Media"
        description="Facebook & Instagram — posts, comments, DMs, and engagement with Grok-assisted replies."
      />

      <CatchUpPanel variant="social" onOpenItem={onCatchUpOpen} />

      {onAskMadison && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--pp-accent)]/25 bg-[var(--pp-accent-soft)]/40 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--pp-text)]">
              Madison · Social & Client Communications
            </p>
            <p className="text-xs text-[var(--pp-text-muted)]">
              Warm, friendly replies for FB/IG and Michelle&apos;s client emails.
            </p>
          </div>
          <button
            type="button"
            onClick={onAskMadison}
            className="rounded-xl bg-[var(--pp-accent)] px-4 py-2.5 text-xs font-semibold text-white"
          >
            Ask Madison
          </button>
        </div>
      )}

      <LiveStatusBar
        enabled={liveModeEnabled}
        checking={isRefreshing}
        lastCheckedAt={lastCheckedAt}
        isRefreshing={isRefreshing}
      />

      {needsReplyComments > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--pp-text)]">
              Comment Queue
            </p>
            <p className="text-xs text-[var(--pp-text-muted)]">
              {needsReplyComments} comment
              {needsReplyComments === 1 ? "" : "s"} need a response
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
        <p className="text-xs font-semibold uppercase tracking-[0.16em] pp-accent-text">
          Meta Business Suite · OAuth
        </p>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--pp-text-muted)]">
          {connection.message}
        </p>
        <p className="mt-2 text-xs leading-5 text-[var(--pp-text-muted)]">
          Later: link Instagram Business to your Facebook Page in Meta Business
          Suite, then add{" "}
          <code className="rounded bg-[var(--pp-accent-muted)] px-1 py-0.5">
            META_APP_ID
          </code>{" "}
          /{" "}
          <code className="rounded bg-[var(--pp-accent-muted)] px-1 py-0.5">
            META_APP_SECRET
          </code>{" "}
          to{" "}
          <code className="rounded bg-[var(--pp-accent-muted)] px-1 py-0.5">
            .env.local
          </code>
          . Sessions persist via server storage + browser localStorage.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-wider text-[var(--pp-text-muted)]">
          <span className="rounded-full border border-[var(--pp-border)] px-2.5 py-1">
            App ID {connection.appIdConfigured ? "✓" : "—"}
          </span>
          <span className="rounded-full border border-[var(--pp-border)] px-2.5 py-1">
            App Secret {connection.appSecretConfigured ? "✓" : "—"}
          </span>
          <span className="rounded-full border border-[var(--pp-border)] px-2.5 py-1">
            Webhooks {connection.webhookConfigured ? "✓" : "—"}
          </span>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-2">
        {accounts.map((account) => {
          const connected = connectedPlatforms.has(account.platform);
          return (
            <div
              key={account.platform}
              className={`rounded-2xl border p-4 ${
                connected
                  ? "border-[var(--pp-accent)] bg-[var(--pp-accent-soft)]"
                  : "border-[var(--pp-border)] bg-[var(--pp-panel)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--pp-accent)] text-sm font-bold text-white">
                      {platformIcon(account.platform)}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[var(--pp-text)]">
                        {account.label}
                      </p>
                      <p className="text-xs pp-accent-text">{account.handle}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-[var(--pp-text-muted)]">
                    {account.description}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                    connected
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-[var(--pp-accent-muted)] text-[var(--pp-text-muted)]"
                  }`}
                >
                  {connected ? "Connected" : "Not connected"}
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                {connected ? (
                  <button
                    type="button"
                    onClick={() => onDisconnect(account.platform)}
                    className="rounded-lg border border-[var(--pp-border)] px-3 py-1.5 text-xs font-medium text-[var(--pp-text-muted)] hover:border-red-400 hover:text-red-500"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      onConnect(account.platform, oauthUrls[account.platform])
                    }
                    className="pp-btn-primary px-3 py-1.5 text-xs"
                  >
                    {oauthUrls[account.platform]
                      ? "Connect with Meta OAuth"
                      : "Connect (demo session)"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {engagement.flatMap((summary) => [
          {
            key: `${summary.platform}-likes`,
            label: `${summary.platform} likes`,
            value: summary.totalLikes.toLocaleString(),
          },
          {
            key: `${summary.platform}-comments`,
            label: `${summary.platform} comments`,
            value: summary.totalComments.toLocaleString(),
          },
          {
            key: `${summary.platform}-reach`,
            label: `${summary.platform} reach`,
            value: summary.totalReach.toLocaleString(),
          },
        ]).map((card) => (
          <div key={card.key} className="pp-stat-card rounded-2xl p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--pp-text-muted)]">
              {card.label}
            </p>
            <p className="mt-2 text-2xl font-semibold pp-accent-text">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <TimePeriodFilter
        value={timePeriod}
        onChange={(period) => {
          setTimePeriod(period);
          setSelectedCommentId(null);
          setSelectedMessageId(null);
          setReplyDraft("");
        }}
        itemCount={timeFilteredItemCount}
        itemLabel={timeFilteredItemLabel}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { id: "all", label: "All platforms" },
            { id: "instagram", label: "Instagram" },
            { id: "facebook", label: "Facebook" },
          ] as const
        ).map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setActivePlatform(filter.id)}
            className={`rounded-full px-4 py-2 text-xs font-medium capitalize transition ${
              activePlatform === filter.id
                ? "bg-[var(--pp-accent)] text-white"
                : "border border-[var(--pp-border)] text-[var(--pp-text-muted)] hover:border-[var(--pp-accent)]"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-[var(--pp-border)] pb-3">
        {(
          [
            { id: "comments", label: `Comments (${unreadComments} unread)` },
            { id: "messages", label: `Messages (${unreadMessages} unread)` },
            { id: "posts", label: "Recent posts" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setSelectedCommentId(null);
              setSelectedMessageId(null);
              setReplyDraft("");
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "pp-nav-active"
                : "text-[var(--pp-text-muted)] hover:bg-[var(--pp-nav-hover)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="pp-panel overflow-hidden rounded-2xl">
          <div className="max-h-[520px] overflow-y-auto">
            {activeTab === "posts" &&
              filteredPosts.map((post) => (
                <article
                  key={post.id}
                  className="border-b border-[var(--pp-border)] px-4 py-4 last:border-b-0"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider pp-accent-text">
                    {post.platform}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--pp-text)]">
                    {post.caption}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--pp-text-muted)]">
                    <span>{post.likes} likes</span>
                    <span>{post.comments} comments</span>
                    <span>{post.reach.toLocaleString()} reach</span>
                    <span>{formatTime(post.publishedAt)}</span>
                  </div>
                </article>
              ))}

            {activeTab === "comments" &&
              (filteredComments.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[var(--pp-text-muted)]">
                  No comments for this filter.
                </p>
              ) : (
                filteredComments.map((comment) => {
                  const isReplied = comment.status === "replied";
                  return (
                  <div
                    key={comment.id}
                    className={`border-b border-[var(--pp-border)] last:border-b-0 ${
                      selectedCommentId === comment.id
                        ? "bg-[var(--pp-accent-soft)]"
                        : ""
                    } ${newItemIdSet.has(comment.id) ? "pp-live-new-item" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCommentId(comment.id);
                        setSelectedMessageId(null);
                        setReplyDraft("");
                        if (comment.status === "unread") {
                          void onUpdateItem("comments", comment.id, "read");
                        }
                      }}
                      className={`flex w-full flex-col gap-1 px-4 py-4 text-left transition hover:bg-[var(--pp-nav-hover)] ${
                        selectedCommentId === comment.id
                          ? "hover:bg-[var(--pp-accent-soft)]"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--pp-text)]">
                          {comment.author}{" "}
                          <span className="text-xs text-[var(--pp-text-muted)]">
                            {comment.authorHandle}
                          </span>
                        </p>
                        <span className="text-[10px] uppercase pp-accent-text">
                          {comment.platform}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--pp-text-muted)]">
                        {comment.text}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] text-[var(--pp-text-muted)]">
                          {formatTime(comment.createdAt)}
                        </p>
                        {comment.status === "unread" && (
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--pp-accent)]" />
                        )}
                        {isReplied && (
                          <RepliedBadge repliedAt={comment.repliedAt} />
                        )}
                      </div>
                    </button>
                    {!isReplied && comment.status !== "archived" && (
                      <div className="flex justify-end px-4 pb-3">
                        <MarkRepliedButton
                          compact
                          disabled={updating === comment.id}
                          onClick={() =>
                            void handleMarkReplied("comments", comment.id)
                          }
                        />
                      </div>
                    )}
                  </div>
                );
                })
              ))}

            {activeTab === "messages" &&
              (filteredMessages.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[var(--pp-text-muted)]">
                  No messages for this filter.
                </p>
              ) : (
                filteredMessages.map((message) => (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => {
                      setSelectedMessageId(message.id);
                      setSelectedCommentId(null);
                      setReplyDraft("");
                      if (message.status === "unread") {
                        void onUpdateItem("messages", message.id, "read");
                      }
                    }}
                    className={`flex w-full flex-col gap-1 border-b border-[var(--pp-border)] px-4 py-4 text-left last:border-b-0 ${
                      selectedMessageId === message.id
                        ? "bg-[var(--pp-accent-soft)]"
                        : "hover:bg-[var(--pp-nav-hover)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-[var(--pp-text)]">
                        {message.sender}
                      </p>
                      <span className="text-[10px] uppercase pp-accent-text">
                        {message.platform}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm text-[var(--pp-text-muted)]">
                      {message.preview}
                    </p>
                    <p className="text-[11px] text-[var(--pp-text-muted)]">
                      {formatTime(message.receivedAt)}
                    </p>
                  </button>
                ))
              ))}
          </div>
        </section>

        <section className="pp-panel rounded-2xl p-5">
          {!selectedComment && !selectedMessage ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
              <p className="text-4xl text-[var(--pp-accent)]">✦</p>
              <p className="mt-4 text-sm font-medium text-[var(--pp-text)]">
                Select a comment or message
              </p>
              <p className="mt-1 max-w-sm text-xs text-[var(--pp-text-muted)]">
                Grok will draft on-brand replies for Party Perfect&apos;s
                Facebook and Instagram.
              </p>
            </div>
          ) : (
            <div className="flex min-h-[360px] flex-col">
              <div className="border-b border-[var(--pp-border)] pb-4">
                <h3 className="text-lg font-semibold text-[var(--pp-text)]">
                  {selectedComment ? "Comment reply" : "Message reply"}
                </h3>
                <p className="mt-2 text-sm text-[var(--pp-text-muted)]">
                  {selectedComment?.text ?? selectedMessage?.body}
                </p>
                {selectedComment?.status === "replied" && (
                  <div className="mt-3">
                    <RepliedBadge repliedAt={selectedComment.repliedAt} />
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedComment && selectedComment.status !== "replied" && (
                    <MarkRepliedButton
                      disabled={updating !== null}
                      onClick={() =>
                        void handleMarkReplied("comments", selectedComment.id)
                      }
                    />
                  )}
                  <button
                    type="button"
                    disabled={updating !== null}
                    onClick={async () => {
                      const id = selectedComment?.id ?? selectedMessage?.id;
                      const kind = selectedComment ? "comments" : "messages";
                      if (!id) return;
                      setUpdating(id);
                      try {
                        await onUpdateItem(kind, id, "archived");
                        setSelectedCommentId(null);
                        setSelectedMessageId(null);
                        setReplyDraft("");
                      } finally {
                        setUpdating(null);
                      }
                    }}
                    className="rounded-lg border border-[var(--pp-border)] px-3 py-1.5 text-xs text-[var(--pp-text-muted)]"
                  >
                    Archive
                  </button>
                </div>
              </div>

              <ReplyComposer
                channelName={replyChannelName}
                successMessage={`Reply copied — paste into ${replyChannelName}`}
                draft={replyDraft}
                onDraftChange={setReplyDraft}
                instructions={replyInstructions}
                onInstructionsChange={setReplyInstructions}
                tone={replyTone}
                onToneChange={setReplyTone}
                drafting={drafting}
                onDraftWithGrok={() => {
                  if (selectedComment) {
                    return handleDraftReply("comments", selectedComment.id);
                  }
                  if (selectedMessage) {
                    return handleDraftReply("messages", selectedMessage.id);
                  }
                }}
                onSendReply={async () => {
                  const id = selectedComment?.id ?? selectedMessage?.id;
                  const kind = selectedComment ? "comments" : "messages";
                  if (id) {
                    await onUpdateItem(kind, id, "replied");
                  }
                }}
                instructionsPlaceholder="Optional Grok instructions (e.g. mention spring promo, invite to DM for quote)"
                draftPlaceholder="Draft your reply, or let Grok write something on-brand…"
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
