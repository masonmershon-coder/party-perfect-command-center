"use client";

import { PageHeader } from "@/app/components/dashboard/page-header";
import { StatusBadge } from "@/app/components/status-badge";
import { useSpeechToText } from "@/lib/speech-to-text";
import type { Agent, Message } from "@/lib/types";
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

type SmsResult = {
  success: boolean;
  message: string;
  recap?: string;
  body?: string;
  fromDisplay?: string;
  toDisplay?: string;
};

export function AgentChatView({
  agent,
  messages,
  isStreaming,
  onSendMessage,
  onBack,
  showBack = false,
  sectionTitle = "Chat",
  enableVoice = false,
  onSendWeeklyRecap,
  onSendTestSms,
  agentHints,
}: {
  agent: Agent | null;
  messages: Message[];
  isStreaming: boolean;
  onSendMessage: (message: string) => Promise<void>;
  onBack?: () => void;
  showBack?: boolean;
  sectionTitle?: string;
  enableVoice?: boolean;
  onSendWeeklyRecap?: () => Promise<SmsResult>;
  onSendTestSms?: () => Promise<SmsResult>;
  agentHints?: string[];
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [smsBusy, setSmsBusy] = useState<"recap" | "test" | null>(null);
  const [smsState, setSmsState] = useState<"idle" | "success" | "error">("idle");
  const [smsFeedback, setSmsFeedback] = useState<string | null>(null);
  const [smsPreview, setSmsPreview] = useState<string | null>(null);
  const [smsMeta, setSmsMeta] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const speech = useSpeechToText({
    continuous: true,
    onFinalTranscript: (text) => {
      setInput((prev) => (prev ? `${prev.trim()} ${text}` : text));
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [input]);

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !agent || isStreaming) return;

    setError(null);
    setInput("");
    if (speech.listening) speech.stop();

    try {
      await onSendMessage(trimmed);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to send message.",
      );
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  }

  async function runSmsAction(
    kind: "recap" | "test",
    action: () => Promise<SmsResult>,
  ) {
    if (smsBusy) return;

    setSmsBusy(kind);
    setSmsState("idle");
    setSmsFeedback(null);
    setSmsPreview(null);
    setSmsMeta(null);

    try {
      const result = await action();
      setSmsState("success");
      setSmsFeedback(result.message);
      setSmsPreview(result.recap ?? result.body ?? null);
      if (result.fromDisplay || result.toDisplay) {
        setSmsMeta(
          `From ${result.fromDisplay ?? "Twilio"} → ${result.toDisplay ?? "manager"}`,
        );
      }
    } catch (smsError) {
      setSmsState("error");
      setSmsFeedback(
        smsError instanceof Error ? smsError.message : "Failed to send SMS.",
      );
    } finally {
      setSmsBusy(null);
    }
  }

  if (!agent) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-[var(--pp-text-muted)]">Select an agent to begin.</p>
      </div>
    );
  }

  const showSmsPanel = Boolean(onSendWeeklyRecap || onSendTestSms);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow={sectionTitle}
        title={agent.name}
        description={agent.description}
        action={
          <div className="flex items-center gap-2">
            {showBack && onBack && (
              <button type="button" onClick={onBack} className="pp-btn-secondary px-4 py-2 text-xs">
                ← Back
              </button>
            )}
            <StatusBadge status={agent.status} />
            <span className="pp-badge px-3 py-1">{agent.model}</span>
          </div>
        }
      />

      {agentHints && agentHints.length > 0 && (
        <div className="mb-4 rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-panel)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider pp-accent-text">
            Quick prompts
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {agentHints.map((hint) => (
              <button
                key={hint}
                type="button"
                onClick={() => setInput(hint)}
                className="rounded-lg border border-[var(--pp-border)] px-3 py-1.5 text-xs text-[var(--pp-text-muted)] hover:border-[var(--pp-accent)] hover:pp-accent-text"
              >
                {hint}
              </button>
            ))}
          </div>
        </div>
      )}

      {showSmsPanel && (
        <div className="mb-4 rounded-2xl border border-[var(--pp-accent)]/30 bg-[var(--pp-accent-soft)]/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--pp-text)]">
                Twilio SMS
              </p>
              <p className="mt-1 text-xs text-[var(--pp-text-muted)]">
                Sends from your Twilio number in{" "}
                <code className="rounded bg-[var(--pp-accent-muted)] px-1">.env.local</code>{" "}
                to the manager phone. Recaps also save to Reports.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {onSendTestSms && (
                <button
                  type="button"
                  disabled={smsBusy !== null || isStreaming}
                  onClick={() =>
                    void runSmsAction("test", onSendTestSms)
                  }
                  className="rounded-xl border border-[var(--pp-accent)] bg-white px-4 py-3 text-sm font-semibold pp-accent-text transition hover:bg-[var(--pp-accent-soft)] disabled:opacity-60"
                >
                  {smsBusy === "test" ? "Sending test…" : "Send Test SMS"}
                </button>
              )}
              {onSendWeeklyRecap && (
                <button
                  type="button"
                  disabled={smsBusy !== null || isStreaming}
                  onClick={() =>
                    void runSmsAction("recap", onSendWeeklyRecap)
                  }
                  className="rounded-xl bg-[var(--pp-accent)] px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-60"
                >
                  {smsBusy === "recap"
                    ? "Generating & sending…"
                    : "Generate & Send Weekly Recap"}
                </button>
              )}
            </div>
          </div>

          {smsState === "success" && smsFeedback && (
            <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <p className="text-sm font-medium text-emerald-700">
                {smsFeedback}
              </p>
              {smsMeta && (
                <p className="mt-1 text-xs text-emerald-700/80">{smsMeta}</p>
              )}
              {smsPreview && (
                <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-5 text-[var(--pp-text-muted)]">
                  {smsPreview}
                </pre>
              )}
            </div>
          )}

          {smsState === "error" && smsFeedback && (
            <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
              {smsFeedback}
            </p>
          )}
        </div>
      )}

      <div className="pp-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
          {messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--pp-accent-muted)] text-3xl">
                {agent.icon}
              </span>
              <p className="text-xl font-semibold text-[var(--pp-text)]">How can I help?</p>
              <p className="mt-2 text-sm text-[var(--pp-text-muted)]">
                Ask {agent.name} about Party Perfect operations in Tulsa.
              </p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7 ${
                        isUser
                          ? "bg-[var(--pp-message-user)] text-white"
                          : "bg-[var(--pp-message-assistant)] text-[var(--pp-text)] border border-[var(--pp-border)]"
                      }`}
                    >
                      {!isUser && (
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider pp-accent-text">
                          {agent.name}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap">
                        {message.content || (isStreaming && !isUser ? "…" : "")}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="border-t border-[var(--pp-border)] px-3 py-3 sm:px-6 sm:py-4">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:gap-3"
          >
            <div className="pp-input flex flex-1 items-end gap-2 px-3 py-3 sm:px-4">
              <textarea
                ref={textareaRef}
                value={
                  speech.listening && speech.interim
                    ? `${input}${input ? " " : ""}${speech.interim}`
                    : input
                }
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={`Message ${agent.name}…`}
                disabled={isStreaming}
                className="max-h-40 w-full resize-none bg-transparent text-base leading-6 text-[var(--pp-text)] outline-none placeholder:text-[var(--pp-text-muted)] disabled:opacity-60 sm:text-sm"
              />
              {enableVoice && (
                <button
                  type="button"
                  disabled={isStreaming || !speech.supported}
                  onPointerDown={(event) => {
                    if (event.button !== 0 || isStreaming || !speech.supported) {
                      return;
                    }
                    event.preventDefault();
                    speech.start();
                  }}
                  onPointerUp={() => {
                    if (speech.listening) speech.stop();
                  }}
                  onPointerLeave={() => {
                    if (speech.listening) speech.stop();
                  }}
                  onPointerCancel={() => {
                    if (speech.listening) speech.stop();
                  }}
                  onClick={(event) => {
                    // Fallback single-tap toggle for touch devices that miss hold.
                    if (!speech.supported || isStreaming) return;
                    if (event.detail === 0) return;
                  }}
                  className={`mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-base ${
                    speech.listening
                      ? "border-red-500/50 bg-red-500/15 text-red-600"
                      : speech.supported
                        ? "border-[var(--pp-border)] text-[var(--pp-text)] hover:border-[var(--pp-accent)] hover:pp-accent-text"
                        : "cursor-not-allowed border-[var(--pp-border)] text-[var(--pp-text-muted)] opacity-50"
                  }`}
                  title={
                    !speech.supported
                      ? "Voice needs Chrome or Safari (HTTPS)"
                      : speech.listening
                        ? "Release to stop"
                        : "Hold to talk — speech to text"
                  }
                  aria-label={
                    speech.listening ? "Listening — release to stop" : "Hold to talk"
                  }
                >
                  {speech.listening ? "●" : "🎙"}
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="pp-btn-primary inline-flex h-12 w-full items-center justify-center px-5 text-sm sm:w-auto"
            >
              {isStreaming ? "…" : "Send"}
            </button>
          </form>
          {enableVoice && (
            <p className="mx-auto mt-2 max-w-3xl text-[11px] text-[var(--pp-text-muted)]">
              {speech.supported
                ? speech.listening
                  ? "Listening… release the mic when you’re done talking."
                  : "Hold the mic button and speak — text fills the box, then hit Send."
                : "Mic needs Chrome or Safari on HTTPS. Allow microphone permission if prompted."}
            </p>
          )}
          {(error || speech.error) && (
            <p className="mx-auto mt-3 max-w-3xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500">
              {error || speech.error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
