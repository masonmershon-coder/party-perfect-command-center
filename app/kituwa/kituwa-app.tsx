"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MatterEntity } from "./components/matter-entity";
import { MatterAcknowledgment } from "./components/matter-acknowledgment";
import { KituwaNav } from "./components/kituwa-nav";
import { MatterLive } from "./matter-live";
import type { MessageSubmitResponse } from "@/lib/matter/kituwa-contract-types";
import type { KituwaState } from "@/lib/kituwa/types";

type HealthMetric = {
  value: string;
  source: string;
  observed_at: string;
  last_success_at: string | null;
  stale_after: string | null;
  status: string;
  reason: string | null;
};

type Health = {
  matter: string;
  currentTask: string;
  lastBrainSync: string | null;
  lastHeartbeat: string | null;
  metrics?: Record<string, HealthMetric>;
  registryWorkers?: Array<{
    worker_id: string;
    provider: string | null;
    available: boolean;
    heartbeat_fresh: boolean;
    last_heartbeat: string | null;
  }>;
};

type Payload = { state: KituwaState; health: Health };

function dotTone(status: string) {
  if (status === "BLOCKED") return "blocked";
  if (status === "WAITING" || status === "WAITING_FOR_APPROVAL") return "wait";
  if (status === "IDLE" || status === "COMPLETE") return "idle";
  return "live";
}

function clientMessageId() {
  return crypto.randomUUID();
}

export function KituwaApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [ack, setAck] = useState<MessageSubmitResponse | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/kituwa/state", { cache: "no-store" });
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    if (!res.ok) {
      setAuthed(false);
      return;
    }
    const data = (await res.json()) as Payload;
    setPayload(data);
    setAuthed(true);
  }, []);

  useEffect(() => {
    void load();
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/kituwa/sw.js").catch(() => undefined);
    }
  }, [load]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/kituwa/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) {
      setError("That PIN did not work.");
      return;
    }
    setPin("");
    await load();
  }

  async function sendMessage(value = text) {
    const next = value.trim();
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/matter/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_message_id: clientMessageId(),
          conversation_id: conversationId,
          text: next,
          attachments: [],
          source: "kituwa_web",
          client_created_at: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Matter could not take that.");
        return;
      }
      setAck(data as MessageSubmitResponse);
      setConversationId(data.conversation_id);
      setText("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/kituwa/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Upload failed.");
      return;
    }
    setText((t) => t || `Attachment: ${file.name}. Add instructions and send.`);
  }

  if (authed === null) {
    return (
      <div className="kituwa-shell">
        <div className="kituwa-brand">KITUWA</div>
        <p className="kituwa-status">Opening…</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <main className="kituwa-shell">
        <p className="kituwa-brand-word">KITUWA</p>
        <h1 className="kituwa-page-title">Private access</h1>
        <p className="kituwa-prompt">Matter is private.</p>
        <form className="kituwa-login" onSubmit={(e) => void signIn(e)}>
          <label htmlFor="owner-pin">Owner PIN</label>
          <input
            id="owner-pin"
            className="kituwa-input"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Owner PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <button className="kituwa-send kituwa-hit" type="submit">
            Enter
          </button>
          {error ? <p className="kituwa-error">{error}</p> : null}
        </form>
      </main>
    );
  }

  const state = payload?.state;
  const health = payload?.health;
  const status = state?.matterStatus || "IDLE";
  const lastMatter = [...(state?.messages || [])].reverse().find((m) => m.role === "matter");

  return (
    <main className="kituwa-shell">
      <header className="kituwa-top">
        <div>
          <p className="kituwa-brand-word">KITUWA</p>
          <h1 className="kituwa-page-title">Matter command</h1>
        </div>
        <div className="kituwa-status">
          <span className="kituwa-dot" data-tone={dotTone(status)} />
          MATTER {status.replaceAll("_", " ")}
        </div>
      </header>

      <KituwaNav />

      <section aria-label="Matter core">
        <MatterEntity status={status} />
        <p className="kituwa-matter-tag">MATTER · Your AI operating system</p>
      </section>

      <section aria-label="Talk to Matter">
        <h2 className="kituwa-section-title">What do you need?</h2>
        <div className="kituwa-composer">
          <label className="kituwa-visually-hidden" htmlFor="talk-to-matter">
            Talk to Matter
          </label>
          <textarea
            id="talk-to-matter"
            className="kituwa-input"
            rows={3}
            placeholder="Talk to Matter"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="kituwa-send kituwa-hit"
            type="button"
            disabled={busy}
            onClick={() => void sendMessage()}
          >
            {busy ? "…" : "Go"}
          </button>
        </div>
        <div className="kituwa-attach-row">
          <label className="kituwa-attach-label kituwa-hit">
            <input
              ref={fileRef}
              className="kituwa-hidden"
              type="file"
              accept="image/*,audio/*,.pdf,.txt,.md,.doc,.docx"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            Attach one file
          </label>
        </div>
      </section>

      <MatterAcknowledgment ack={ack} />

      {lastMatter ? (
        <section className="kituwa-msg" aria-label="Matter reply">
          <h2 className="kituwa-section-title">Current mission</h2>
          <p>{lastMatter.text}</p>
        </section>
      ) : null}

      {error ? <p className="kituwa-error">{error}</p> : null}

      <details className="kituwa-panel" open>
        <summary>Matter&apos;s live plan</summary>
        <div className="kituwa-panel-body">
          {(state?.plan || []).map((step) => (
            <div className="kituwa-step" key={step.id}>
              <span className="kituwa-mark" data-s={step.status}>
                {step.status === "done" ? "✓" : step.status === "blocked" ? "!" : "○"}
              </span>
              <div>
                {step.label}
                {step.detail ? <small>{step.detail}</small> : null}
              </div>
            </div>
          ))}
        </div>
      </details>

      <details className="kituwa-panel">
        <summary>Matter Live</summary>
        <div className="kituwa-panel-body">
          <MatterLive tasks={state?.tasks || []} workers={health?.registryWorkers || []} />
        </div>
      </details>

      <details className="kituwa-panel">
        <summary>Brain health</summary>
        <div className="kituwa-panel-body kituwa-health">
          {health?.metrics
            ? Object.entries(health.metrics).map(([key, metric]) => (
                <div key={key} className="kituwa-metric">
                  <dt>{key.replaceAll("_", " ")}</dt>
                  <dd>
                    <strong>{metric.value}</strong>
                    <small>
                      {metric.status} · {metric.source}
                      {metric.reason ? ` · ${metric.reason}` : ""}
                    </small>
                    <small>observed {metric.observed_at}</small>
                  </dd>
                </div>
              ))
            : null}
        </div>
      </details>

      <div className="kituwa-footer-actions">
        <Link href="/tower" className="kituwa-link-btn kituwa-hit">
          Open Matter Tower
        </Link>
        <Link href="/tasks" className="kituwa-link-btn kituwa-hit">
          View tasks
        </Link>
        <button
          className="kituwa-signout kituwa-hit"
          type="button"
          onClick={() => {
            void fetch("/api/kituwa/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "signout" }),
            }).then(() => {
              setAuthed(false);
              setPayload(null);
              setAck(null);
            });
          }}
        >
          Sign out this device
        </button>
      </div>
    </main>
  );
}
