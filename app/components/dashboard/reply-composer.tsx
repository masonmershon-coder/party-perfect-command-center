"use client";

import { useEffect, useState } from "react";

type ReplyTone = "professional" | "friendly" | "concise";

export function ReplyComposer({
  channelName,
  successMessage,
  draft,
  onDraftChange,
  instructions,
  onInstructionsChange,
  tone,
  onToneChange,
  drafting,
  onDraftWithGrok,
  onSendReply,
  instructionsPlaceholder = "Optional instructions for Grok…",
  draftPlaceholder = "Draft your reply here, or let Grok write it for you…",
  copyBeforeSend = true,
  sendButtonLabel = "Send Reply",
}: {
  channelName: string;
  successMessage: string;
  draft: string;
  onDraftChange: (value: string) => void;
  instructions: string;
  onInstructionsChange: (value: string) => void;
  tone: ReplyTone;
  onToneChange: (tone: ReplyTone) => void;
  drafting: boolean;
  onDraftWithGrok: () => void | Promise<void>;
  onSendReply?: () => void | Promise<void>;
  instructionsPlaceholder?: string;
  draftPlaceholder?: string;
  /** When false, skip clipboard copy (used for live Meta API send). */
  copyBeforeSend?: boolean;
  sendButtonLabel?: string;
}) {
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const hasDraft = draft.trim().length > 0;

  useEffect(() => {
    if (!copied && !sent) return;
    const timer = window.setTimeout(() => {
      setCopied(false);
      setSent(false);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [copied, sent]);

  async function copyDraftToClipboard(text: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!ok) throw new Error("Clipboard unavailable.");
  }

  async function handleSendReply() {
    if (!hasDraft || sending) return;

    setSending(true);
    setCopyError(null);
    setSendError(null);

    try {
      if (copyBeforeSend) {
        await copyDraftToClipboard(draft.trim());
        setCopied(true);
      }
      await onSendReply?.();
      if (!copyBeforeSend) {
        setSent(true);
        onDraftChange("");
      }
    } catch (error) {
      if (copyBeforeSend) {
        setCopyError(
          `Could not copy automatically — select the text and copy manually, then paste into ${channelName}.`,
        );
      } else {
        setSendError(
          error instanceof Error
            ? error.message
            : `Failed to send reply to ${channelName}.`,
        );
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-[var(--pp-border)] pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-[var(--pp-text)]">Reply</h4>
        <span className="text-[10px] uppercase tracking-[0.16em] pp-accent-text">
          Grok-assisted
        </span>
      </div>

      {(copied || sent) && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400"
        >
          <p className="font-semibold">✓ {successMessage}</p>
          {copied && (
            <p className="mt-1 text-xs opacity-90">
              Switch to {channelName}, paste, and send if needed.
            </p>
          )}
        </div>
      )}

      {copyError && (
        <p className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
          {copyError}
        </p>
      )}

      {sendError && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {sendError}
        </p>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {(["professional", "friendly", "concise"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onToneChange(option)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
              tone === option
                ? "bg-[var(--pp-accent)] text-white"
                : "border border-[var(--pp-border)] text-[var(--pp-text-muted)] hover:border-[var(--pp-accent)]"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <input
        value={instructions}
        onChange={(event) => onInstructionsChange(event.target.value)}
        placeholder={instructionsPlaceholder}
        className="pp-input mb-3 w-full px-4 py-2.5 text-sm"
      />

      <textarea
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void handleSendReply();
          }
        }}
        placeholder={draftPlaceholder}
        rows={8}
        className="pp-input mb-4 w-full resize-none px-4 py-3 text-sm leading-6"
      />

      <button
        type="button"
        disabled={!hasDraft || sending}
        onClick={() => void handleSendReply()}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--pp-accent)] px-6 py-4 text-base font-semibold text-white shadow-md transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {sending ? "Sending…" : sendButtonLabel}
      </button>
      <p className="mb-3 text-center text-[10px] text-[var(--pp-text-muted)]">
        Tip: ⌘/Ctrl + Enter to send quickly
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={drafting}
          onClick={() => void onDraftWithGrok()}
          className="rounded-xl border border-[var(--pp-accent)] px-4 py-2.5 text-sm font-medium pp-accent-text transition hover:bg-[var(--pp-accent-soft)] disabled:opacity-60"
        >
          {drafting ? "Drafting with Grok…" : "Draft with Grok"}
        </button>
        <button
          type="button"
          onClick={() => {
            onDraftChange("");
            setCopied(false);
            setSent(false);
            setCopyError(null);
            setSendError(null);
          }}
          className="rounded-xl border border-[var(--pp-border)] px-4 py-2.5 text-sm text-[var(--pp-text-muted)] transition hover:border-[var(--pp-accent)]"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
