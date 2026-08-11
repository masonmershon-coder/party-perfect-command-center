"use client";

import { useCallback, useEffect, useState } from "react";

type Task = { id: string; title: string; status: string; created_at?: string; intent?: string; result?: string | null };
type Approval = { id: string; summary: string; status: string; risk?: string | null };
type Persona = "matter" | "mike";

export function MatterClient() {
  const [persona, setPersona] = useState<Persona>("mike");
  const [text, setText] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([
        fetch(`/api/ai-core/tasks?persona=${persona}`).then((r) => r.json()),
        fetch(`/api/ai-core/approvals?persona=${persona}`).then((r) => r.json()),
      ]);
      setOffline(Boolean(t.note || a.note));
      setTasks(Array.isArray(t.tasks) ? t.tasks : []);
      setApprovals(Array.isArray(a.approvals) ? a.approvals : []);
    } catch {
      setMsg("Network error");
    }
  }, [persona]);

  useEffect(() => { void load(); }, [load]);

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/ai-core/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona, title: text.trim(), source: "text", type: "analysis" }),
      });
      const d = await r.json();
      if (!r.ok) setMsg(d.error || "Failed");
      else { setText(""); setMsg("Task created ✓"); void load(); }
    } catch { setMsg("Network error"); }
    finally { setBusy(false); }
  }

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    await fetch(`/api/ai-core/approvals/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }),
    });
    void load();
  }

  const isMatter = persona === "matter";
  const accent = isMatter ? "#7c5cff" : "#0aa0a0";

  return (
    <div style={{ minHeight: "100dvh", background: "#0b0b0c", color: "#f2f2f3" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "16px 14px 40px" }}>
        {/* persona selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {(["matter", "mike"] as Persona[]).map((p) => (
            <button key={p} onClick={() => setPersona(p)}
              style={{ flex: 1, padding: "12px", borderRadius: 14, border: "1px solid #26262a", fontWeight: 700, fontSize: 16,
                background: persona === p ? (p === "matter" ? "#7c5cff" : "#0aa0a0") : "#141416",
                color: persona === p ? "#0b0b0c" : "#a8a8ad" }}>
              {p === "matter" ? "Matter" : "Mike"}
            </button>
          ))}
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "#8a8a90" }}>
          {isMatter ? "Personal · mershon_personal (owner only)" : "Party Perfect · party_perfect"}
        </p>

        {offline && (
          <div style={{ padding: 12, borderRadius: 12, background: "#241d0f", color: "#e8c37a", fontSize: 13, marginBottom: 14 }}>
            AI Core is being connected (Supabase). The interface is live; tasks &amp; approvals appear once <code>DATABASE_URL</code> is set.
          </div>
        )}

        {/* input */}
        <div style={{ background: "#141416", border: "1px solid #26262a", borderRadius: 16, padding: 12, marginBottom: 8 }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
            placeholder={isMatter ? "Ask Matter… (e.g. where are we on my AI server?)" : "Ask Mike… (e.g. what do I need to handle at Party Perfect today?)"}
            style={{ width: "100%", background: "transparent", color: "#f2f2f3", border: "none", outline: "none", resize: "none", fontSize: 16 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <button title="Voice (coming soon)" disabled style={{ opacity: 0.4, padding: "8px 10px", borderRadius: 10, border: "1px solid #26262a", background: "#141416", color: "#a8a8ad" }}>🎤</button>
            <button title="Photo (coming soon)" disabled style={{ opacity: 0.4, padding: "8px 10px", borderRadius: 10, border: "1px solid #26262a", background: "#141416", color: "#a8a8ad" }}>📷</button>
            <button title="File (coming soon)" disabled style={{ opacity: 0.4, padding: "8px 10px", borderRadius: 10, border: "1px solid #26262a", background: "#141416", color: "#a8a8ad" }}>📎</button>
            <div style={{ flex: 1 }} />
            <button onClick={() => void submit()} disabled={busy || !text.trim()}
              style={{ padding: "10px 18px", borderRadius: 12, border: "none", fontWeight: 700, fontSize: 16, background: accent, color: "#0b0b0c", opacity: busy || !text.trim() ? 0.5 : 1 }}>
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
        {msg && <p style={{ fontSize: 13, color: msg.includes("✓") ? "#7fdca0" : "#e08a8a", margin: "4px 2px 16px" }}>{msg}</p>}

        {/* approvals */}
        {approvals.length > 0 && (
          <section style={{ marginTop: 18 }}>
            <h2 style={{ fontSize: 13, letterSpacing: 0.5, color: "#8a8a90", margin: "0 0 8px", textTransform: "uppercase" }}>Approvals</h2>
            {approvals.map((a) => (
              <div key={a.id} style={{ background: "#141416", border: "1px solid #26262a", borderRadius: 14, padding: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 15, marginBottom: 8 }}>{a.summary}{a.risk ? <span style={{ color: "#e8c37a", fontSize: 12 }}> · {a.risk}</span> : null}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => void decide(a.id, "APPROVED")} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", fontWeight: 700, background: "#1f7a3f", color: "#fff" }}>Approve</button>
                  <button onClick={() => void decide(a.id, "REJECTED")} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #26262a", fontWeight: 700, background: "#141416", color: "#e08a8a" }}>Reject</button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* recent tasks */}
        <section style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 13, letterSpacing: 0.5, color: "#8a8a90", margin: "0 0 8px", textTransform: "uppercase" }}>Recent</h2>
          {tasks.length === 0 && <p style={{ color: "#6a6a70", fontSize: 14 }}>No tasks yet.</p>}
          {tasks.map((t) => (
            <div key={t.id} style={{ background: "#141416", border: "1px solid #26262a", borderRadius: 14, padding: 12, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 15 }}>{t.title}</span>
                <span style={{ fontSize: 11, color: "#8a8a90", whiteSpace: "nowrap" }}>{t.status}</span>
              </div>
              {t.result && <p style={{ marginTop: 8, fontSize: 14, color: "#c8c8ce" }}>{t.result}</p>}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
