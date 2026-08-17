// MIKE LIVE ANSWER — the fast read-only path for "current" Party Perfect questions.
//
// ADDITIVE by design: this file is new and imports the committed mike-brain/eod helpers
// read-only. It does not modify route.mjs, tools.mjs, or intent.mjs. It exists so a
// read-only live-data question ("how many delivery tickets out today?") gets an ANSWER
// with its source and age — instead of being routed to the approval-gated task path.
//
// It REUSES the stale-data gate from tools.mjs (answerFor/formatAnswer/fieldForQuestion),
// supplying the one thing tools.mjs was missing: a fetch that actually reaches the live
// ops counts. The Mac's KV store does not hold the production snapshot (prod store is
// separate), and /api/health strips the ops section — so the only live source is the
// authenticated Command Center endpoint GET /api/por/sync, which returns
// { snapshot: { ops: { deliveriesToday, returnsDueToday, openContracts }, syncedAt } }.
//
// SECURITY: authenticates with the team password from the macOS Keychain (the same secret
// the intake worker already uses) to obtain a short-lived session cookie. The password and
// the cookie are NEVER logged, persisted, committed, or placed in a task/AI-HANDOFF. A
// scoped Mike-read-only token (like TIME_MIKE_TOKEN_SHA256) is the hardening follow-up —
// see the Cursor handoff — but is not required for the read-only answer to work today.
import { execFileSync } from "node:child_process";
import { authorizeSender } from "../eod/trigger.mjs";
import { answerFor, formatAnswer, fieldForQuestion, MAX_FRESH_MS } from "./tools.mjs";

const keychain = (service) => {
  try {
    return execFileSync("security", ["find-generic-password", "-s", service, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/\n$/, "");
  } catch { return ""; }
};

/** Human labels for the fields tools.fieldForQuestion can return. */
const LABELS = {
  deliveriesToday: "Deliveries out today",
  returnsDueToday: "Returns due today",
  openContracts: "Open contracts",
};

/**
 * Fetch the live POR snapshot via an authenticated Command Center session.
 * Returns { live, snapshot } shaped exactly for tools.answerFor():
 *   live: { ok, code?, freshness?, syncedAt?, ageMinutes? }
 *   snapshot: the raw snapshot with .ops (or null)
 * Never throws into the answer path — an exception becomes ok:false, never a wrong number.
 */
export async function fetchLiveSnapshotViaSession({
  baseUrl = "https://partyperfect.app", fetchImpl = fetch, timeoutMs = 12000, teamPassword,
} = {}) {
  const pw = teamPassword || process.env.PP_TEAM_PASSWORD || keychain("partyperfect-team-password");
  if (!pw) return { live: { ok: false, code: "LIVE_NOT_CONFIGURED" }, snapshot: null };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const login = await fetchImpl(`${baseUrl}/api/auth/session`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }), signal: ctl.signal,
    });
    if (!login.ok) return { live: { ok: false, code: "LIVE_UNAVAILABLE", detail: `auth ${login.status}` }, snapshot: null };
    const jar = (login.headers.get("set-cookie") || "").split(",").map((c) => c.split(";")[0]).filter(Boolean).join("; ");
    if (!jar) return { live: { ok: false, code: "LIVE_UNAVAILABLE", detail: "no session" }, snapshot: null };

    const r = await fetchImpl(`${baseUrl}/api/por/sync`, { headers: { cookie: jar }, signal: ctl.signal });
    if (!r.ok) return { live: { ok: false, code: "LIVE_UNAVAILABLE", detail: `sync ${r.status}` }, snapshot: null };
    const j = await r.json();
    const snap = j?.snapshot;
    if (!snap || !snap.syncedAt) return { live: { ok: false, code: "LIVE_NO_SNAPSHOT" }, snapshot: null };

    const syncedMs = Date.parse(snap.syncedAt);
    const ageMs = Number.isFinite(syncedMs) ? Date.now() - syncedMs : null;
    const stale = ageMs != null && ageMs > MAX_FRESH_MS;
    const freshness = j?.meta?.freshness ?? (stale ? "stale" : "fresh");
    return {
      live: {
        ok: !stale, code: stale ? "LIVE_STALE" : undefined, freshness,
        syncedAt: snap.syncedAt, ageMinutes: ageMs == null ? null : Math.round(ageMs / 60000),
      },
      snapshot: snap,
    };
  } catch (e) {
    return { live: { ok: false, code: "LIVE_UNREACHABLE", detail: String(e?.message || e).slice(0, 120) }, snapshot: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Answer a read-only live-data question, or decline to (so the caller falls through to the
 * normal Matter task path for anything that isn't a fast read).
 *
 * @returns {{answered:boolean, text?:string, field?:string, value?:any, code?:string}}
 *   answered:false  — not an authenticated read-only live-data question; caller handles it.
 *   answered:true   — a reply is ready (a live figure, or an honest "I don't have current data").
 */
export async function answerLiveQuestion(message, config = {}, io = {}) {
  // Identity is authenticated by the bridge handle mapping, never the message text.
  const auth = authorizeSender(message.senderHandle, config);
  if (!auth.authorized) return { answered: false, code: "UNAUTHORIZED" };

  // Only fast, read-only questions this snapshot can answer. Everything else falls through.
  const field = fieldForQuestion(message.text);
  if (!field) return { answered: false, code: "NOT_A_LIVE_DATA_QUESTION" };

  const { live, snapshot } = await fetchLiveSnapshotViaSession(io);
  const result = answerFor({ question: message.text, live, snapshot, field });
  const label = LABELS[field] || field;
  return {
    answered: true,
    field,
    value: result.answerable ? result.value : undefined,
    code: result.answerable ? "ANSWERED" : (result.code || "UNAVAILABLE"),
    text: formatAnswer(label, result),
  };
}
