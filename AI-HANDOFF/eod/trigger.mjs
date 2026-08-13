// EOD TRIGGER — intent parsing + sender authorization. PURE, DETERMINISTIC, NO SIDE EFFECTS.
//
// Two separate decisions, deliberately kept apart:
//   1. IS THIS THE COMMAND?      — parseEodIntent(text)
//   2. IS THIS PERSON ALLOWED?   — authorizeSender(authenticatedHandle, config)
//
// They never inform each other. A message cannot argue its way into being
// authorized, and an authorized sender cannot trigger a run with a vague message.
//
// THE IDENTITY RULE
// Sender identity comes ONLY from the authenticated iMessage bridge mapping — the
// `handle` column joined from Messages, which the sender cannot forge in the body.
// Nothing in the message text is ever read as identity. A message saying
// "this is Mason" or "from: +1555..." is text, not a claim we act on.
import { createHash } from "node:crypto";

/**
 * Accepted commands, exact intent. Loose matching is explicitly rejected:
 * "ok I'm done for the end of day" must NOT check out the business.
 */
const COMMANDS = [
  { re: /^mike,?\s+begin\s+end[-\s]of[-\s]day\s+safety\s+checkpoint\s+test\.?$/i, mode: "TEST" },
  { re: /^mike,?\s+begin\s+end[-\s]of[-\s]day\s+safety\s+checkpoint\.?$/i, mode: "LIVE" },
  { re: /^mike,?\s+begin\s+end[-\s]of[-\s]day\.?$/i, mode: "LIVE" },
  { re: /^mike,?\s+run\s+eod\s+checkpoint\.?$/i, mode: "LIVE" },
];

/**
 * Parse a deliberate EOD intent.
 * @returns {{isEod:boolean, mode?:"LIVE"|"TEST", reason?:string}}
 */
export function parseEodIntent(text) {
  const raw = String(text ?? "");
  // Normalize only whitespace and smart punctuation — never strip words, because
  // stripping words is how "we should talk about end of day" becomes a command.
  const t = raw
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  if (!t) return { isEod: false, reason: "empty" };
  // TEST is checked first: its pattern is a superset prefix of the LIVE phrase, so
  // evaluating LIVE first would classify a TEST request as a real run.
  for (const c of COMMANDS) {
    if (c.re.test(t)) return { isEod: true, mode: c.mode };
  }
  return { isEod: false, reason: "not_a_deliberate_eod_command" };
}

/**
 * Authorize by AUTHENTICATED handle only.
 * @param authenticatedHandle handle from the bridge's DB join — never from message text
 * @param config { AUTHORIZED: [{handle, name, eodAuthorized?}] }
 */
export function authorizeSender(authenticatedHandle, config = {}) {
  const handle = normalizeHandle(authenticatedHandle);
  if (!handle) return { authorized: false, reason: "no_authenticated_identity" };

  const list = Array.isArray(config.AUTHORIZED) ? config.AUTHORIZED : [];
  const match = list.find((a) => normalizeHandle(a.handle) === handle);
  if (!match) return { authorized: false, reason: "sender_not_in_allowlist" };

  // Being allowed to chat with Mike is NOT the same as being allowed to check out
  // the business. EOD is opt-in per identity. Josh is added by flipping his own
  // entry, never by widening this check.
  if (match.eodAuthorized !== true) {
    return { authorized: false, reason: "sender_not_eod_authorized", name: match.name };
  }
  return { authorized: true, name: match.name, handleHash: hashHandle(handle) };
}

export function normalizeHandle(h) {
  return String(h ?? "")
    .replace(/[^\d+a-zA-Z@.]/g, "")
    .replace(/^1(\d{10})$/, "+1$1")
    .toLowerCase();
}

/** Handles are personal data. Evidence stores the hash, never the number. */
export function hashHandle(h) {
  return createHash("sha256").update(normalizeHandle(h), "utf8").digest("hex").slice(0, 16);
}

/**
 * Idempotency key for one delivered iMessage event.
 *
 * Built from the message ROWID *and* the sender hash. The bridge can restart, the
 * same row can be re-read, or Mason can send the identical text twice — the first
 * two cases must resolve to the SAME run, and only a genuinely new message event
 * (new ROWID) may start a second one.
 */
export function eodIdempotencyKey({ messageRowId, senderHandle }) {
  if (messageRowId == null || messageRowId === "") return null;
  return createHash("sha256")
    .update(`imessage:${messageRowId}:${normalizeHandle(senderHandle)}`, "utf8")
    .digest("hex")
    .slice(0, 24);
}

/**
 * The full gate. Returns exactly what the coordinator needs and nothing sensitive.
 * Message text is NEVER returned — after intent classification it is untrusted
 * input with no further purpose, and carrying it forward is how it ends up in logs.
 */
export function evaluateEodTrigger({ text, authenticatedHandle, messageRowId }, config = {}) {
  const intent = parseEodIntent(text);
  if (!intent.isEod) return { trigger: false, code: "NOT_EOD", reason: intent.reason };

  const auth = authorizeSender(authenticatedHandle, config);
  if (!auth.authorized) return { trigger: false, code: "UNAUTHORIZED", reason: auth.reason };

  const idempotencyKey = eodIdempotencyKey({ messageRowId, senderHandle: authenticatedHandle });
  if (!idempotencyKey) return { trigger: false, code: "NO_EVENT_ID", reason: "message event id required for idempotency" };

  return {
    trigger: true,
    mode: intent.mode,
    requestedByName: auth.name,
    requesterHandleHash: auth.handleHash,
    idempotencyKey,
    channel: "imessage",
  };
}
