"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MatterCore } from "./matter-core";
import { MatterLive } from "./matter-live";
import type { KituwaState } from "@/lib/kituwa/types";

type Health = {
  matter: string;
  brain: string;
  memory: string;
  workers: { available: number; busy: number; unavailable: number; total: number };
  currentTask: string;
  verification: string;
  costToday: string;
  apiBudget: string;
  lastBrainSync: string | null;
  lastHeartbeat: string | null;
  storage: string;
  localMac: string;
  policy: string;
};

type Payload = { state: KituwaState; health: Health };

function mark(status: string) {
  if (status === "done") return "✓";
  if (status === "active") return "●";
  if (status === "blocked") return "!";
  if (status === "waiting") return "…";
  return "○";
}

function dotTone(status: string) {
  if (status === "BLOCKED") return "blocked";
  if (status === "WAITING" || status === "WAITING_FOR_APPROVAL") return "wait";
  if (status === "IDLE" || status === "COMPLETE") return "idle";
  return "live";
}

type BrowserSpeech = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

export function KituwaApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<BrowserSpeech | null>(null);

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

  async function talk(source: "text" | "voice", value = text) {
    const next = value.trim();
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/kituwa/talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: next, source }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Matter could not take that.");
        return;
      }
      setPayload(data as Payload);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  function startVoice() {
    const SpeechAPI = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeech;
      webkitSpeechRecognition?: new () => BrowserSpeech;
    };
    const SR = SpeechAPI.SpeechRecognition || SpeechAPI.webkitSpeechRecognition;
    if (!SR) {
      setError("This browser has no speech recognition. Type, or attach an audio file.");
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const said = ev.results?.[0]?.[0]?.transcript || "";
      setListening(false);
      if (said) void talk("voice", said);
    };
    rec.onerror = () => {
      setListening(false);
      setError("Voice capture failed. You can type instead.");
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
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
    if (file.type.startsWith("audio/")) {
      setText((t) => t || "Audio attached. Transcribe and use this for the current project.");
    }
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
      <div className="kituwa-shell">
        <div className="kituwa-brand">KITUWA</div>
        <p className="kituwa-prompt">Matter is private.</p>
        <form className="kituwa-login" onSubmit={(e) => void signIn(e)}>
          <input
            className="kituwa-input"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Owner PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <button className="kituwa-send" type="submit">
            Enter
          </button>
          {error ? <p className="kituwa-error">{error}</p> : null}
        </form>
      </div>
    );
  }

  const state = payload?.state;
  const health = payload?.health;
  const status = listening ? "LISTENING" : state?.matterStatus || "IDLE";
  const lastMatter = [...(state?.messages || [])].reverse().find((m) => m.role === "matter");

  return (
    <div className="kituwa-shell">
      <header className="kituwa-top">
        <div className="kituwa-brand">KITUWA</div>
        <div className="kituwa-status">
          <span className="kituwa-dot" data-tone={dotTone(status)} />
          MATTER {status.replaceAll("_", " ")}
        </div>
      </header>

      <MatterCore status={status} />
      <p className="kituwa-prompt">What do you need?</p>

      {lastMatter ? (
        <div className="kituwa-msg">
          {lastMatter.text}
          {lastMatter.using.length ? (
            <div className="kituwa-using">
              Using: {lastMatter.using.map((u) => `${u.worker_id} — ${u.role}`).join(" · ") || "none assigned"}
            </div>
          ) : (
            <div className="kituwa-using">Using: no eligible worker assigned</div>
          )}
        </div>
      ) : null}

      <div className="kituwa-composer">
        <textarea
          className="kituwa-input"
          rows={2}
          placeholder="Talk to Matter"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="kituwa-icon-btn"
          type="button"
          data-hot={listening ? "1" : "0"}
          aria-label="Microphone"
          onClick={() => (listening ? recRef.current?.stop() : startVoice())}
        >
          mic
        </button>
        <button className="kituwa-send" type="button" disabled={busy} onClick={() => void talk("text")}>
          {busy ? "…" : "Go"}
        </button>
      </div>
      <div>
        <button className="kituwa-icon-btn" type="button" onClick={() => fileRef.current?.click()}>
          attach
        </button>
        <input
          ref={fileRef}
          className="kituwa-hidden"
          type="file"
          accept="image/*,audio/*,.pdf,.txt,.md,.doc,.docx"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
      {error ? <p className="kituwa-error">{error}</p> : null}

      <details className="kituwa-panel" open>
        <summary>Matter&apos;s live plan</summary>
        <div className="kituwa-panel-body">
          {(state?.plan || []).length ? (
            state?.plan.map((step) => (
              <div className="kituwa-step" key={step.id}>
                <span className="kituwa-mark" data-s={step.status}>
                  {mark(step.status)}
                </span>
                <div>
                  {step.label}
                  {step.detail ? <small>{step.detail}</small> : null}
                </div>
              </div>
            ))
          ) : (
            <p className="kituwa-using">No plan yet. Talk to Matter.</p>
          )}
        </div>
      </details>

      <details className="kituwa-panel">
        <summary>Matter Live</summary>
        <div className="kituwa-panel-body">
          <MatterLive tasks={state?.tasks || []} />
        </div>
      </details>

      <details className="kituwa-panel">
        <summary>Brain health</summary>
        <div className="kituwa-panel-body kituwa-health">
          <dt>Matter</dt>
          <dd>{health?.matter || "UNKNOWN"}</dd>
          <dt>Brain</dt>
          <dd>{health?.brain || "UNKNOWN"}</dd>
          <dt>Memory</dt>
          <dd>{health?.memory || "UNKNOWN"}</dd>
          <dt>Workers</dt>
          <dd>
            {health
              ? `${health.workers.available} available · ${health.workers.busy} busy · ${health.workers.unavailable} unavailable`
              : "UNKNOWN"}
          </dd>
          <dt>Current task</dt>
          <dd>{health?.currentTask || "UNKNOWN"}</dd>
          <dt>Verification</dt>
          <dd>{health?.verification || "UNKNOWN"}</dd>
          <dt>Cost today</dt>
          <dd>{health?.costToday || "UNKNOWN"}</dd>
          <dt>API budget</dt>
          <dd>{health?.apiBudget || "UNKNOWN"}</dd>
          <dt>Last brain sync</dt>
          <dd>{health?.lastBrainSync || "UNKNOWN"}</dd>
          <dt>Last heartbeat</dt>
          <dd>{health?.lastHeartbeat || "UNKNOWN"}</dd>
          <dt>Storage</dt>
          <dd>{health?.storage || "UNKNOWN"}</dd>
          <dt>Local Mac</dt>
          <dd>{health?.localMac || "UNKNOWN"}</dd>
        </div>
      </details>

      <button
        className="kituwa-signout"
        type="button"
        onClick={() => {
          void fetch("/api/kituwa/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "signout" }),
          }).then(() => {
            setAuthed(false);
            setPayload(null);
          });
        }}
      >
        Sign out this device
      </button>
    </div>
  );
}

