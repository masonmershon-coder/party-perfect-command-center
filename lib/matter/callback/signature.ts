import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { CallbackRole } from "./contract";

export const SIGNATURE_VERSION = "v1";

export const HEADER = {
  keyId: "x-matter-key-id",
  timestamp: "x-matter-timestamp",
  nonce: "x-matter-nonce",
  signature: "x-matter-signature",
} as const;

export type CallbackKey = {
  key_id: string;
  principal: string;
  role: CallbackRole;
  domains: string[];
  secret: string;
};

export type KeyRing = ReadonlyMap<string, CallbackKey>;

const KEY_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;
const MIN_SECRET_LENGTH = 32;

/**
 * Parse MATTER_CALLBACK_KEYS: {"<key_id>": {"principal","role","domains":[...],"secret"}}.
 * Any malformed entry rejects the whole ring (fail closed). Errors never include secrets.
 */
export function parseKeyRing(raw: string | undefined): { ok: true; keys: KeyRing } | { ok: false; error: string } {
  if (!raw || !raw.trim()) return { ok: false, error: "MATTER_CALLBACK_KEYS not set" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "MATTER_CALLBACK_KEYS is not valid JSON" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "MATTER_CALLBACK_KEYS must be an object keyed by key id" };
  }
  const keys = new Map<string, CallbackKey>();
  for (const [key_id, v] of Object.entries(parsed as Record<string, unknown>)) {
    const e = v as Partial<CallbackKey> | null;
    if (!KEY_ID.test(key_id)) return { ok: false, error: `invalid key id format: ${key_id.slice(0, 64)}` };
    if (!e || typeof e !== "object") return { ok: false, error: `key ${key_id}: entry must be an object` };
    if (typeof e.principal !== "string" || !e.principal) return { ok: false, error: `key ${key_id}: principal required` };
    if (e.role !== "matter" && e.role !== "worker") return { ok: false, error: `key ${key_id}: role must be matter|worker` };
    if (!Array.isArray(e.domains) || e.domains.length === 0 || !e.domains.every((d) => typeof d === "string")) {
      return { ok: false, error: `key ${key_id}: domains must be a non-empty string array` };
    }
    if (typeof e.secret !== "string" || e.secret.length < MIN_SECRET_LENGTH) {
      return { ok: false, error: `key ${key_id}: secret missing or shorter than ${MIN_SECRET_LENGTH} chars` };
    }
    keys.set(key_id, { key_id, principal: e.principal, role: e.role, domains: [...e.domains], secret: e.secret });
  }
  if (keys.size === 0) return { ok: false, error: "MATTER_CALLBACK_KEYS has no keys" };
  return { ok: true, keys };
}

export function signingInput(timestamp: string, nonce: string, rawBody: string): string {
  return `${SIGNATURE_VERSION}:${timestamp}:${nonce}:${rawBody}`;
}

export function computeSignature(secret: string, timestamp: string, nonce: string, rawBody: string): string {
  const mac = createHmac("sha256", secret).update(signingInput(timestamp, nonce, rawBody)).digest("hex");
  return `${SIGNATURE_VERSION}=${mac}`;
}

/** Headers a sender attaches. Used by tests, the local smoke and future Matter senders. */
export function signRequest(
  key: Pick<CallbackKey, "key_id" | "secret">,
  rawBody: string,
  opts: { timestamp: number; nonce: string },
): Record<string, string> {
  const ts = String(Math.floor(opts.timestamp));
  return {
    [HEADER.keyId]: key.key_id,
    [HEADER.timestamp]: ts,
    [HEADER.nonce]: opts.nonce,
    [HEADER.signature]: computeSignature(key.secret, ts, opts.nonce, rawBody),
  };
}

export type SignatureCheck =
  | { ok: true; key: CallbackKey; timestamp: number; nonce: string }
  | { ok: false; code: "SIGNATURE_INVALID" | "TIMESTAMP_OUT_OF_WINDOW"; reason: string; key_id: string | null };

/**
 * Verify headers + HMAC over the exact raw bytes. Signature comparison is constant-time and
 * runs even for unknown keys (against a dummy) so timing does not reveal which key ids exist.
 */
export function verifySignature(
  headers: Headers,
  rawBody: string,
  keys: KeyRing,
  nowSec: number,
  maxSkewSec: number,
): SignatureCheck {
  const key_id = headers.get(HEADER.keyId);
  const tsRaw = headers.get(HEADER.timestamp);
  const nonce = headers.get(HEADER.nonce);
  const sig = headers.get(HEADER.signature);
  if (!key_id || !tsRaw || !nonce || !sig) {
    return { ok: false, code: "SIGNATURE_INVALID", reason: "missing_signature_headers", key_id: key_id || null };
  }
  if (!KEY_ID.test(key_id)) return { ok: false, code: "SIGNATURE_INVALID", reason: "bad_key_id_format", key_id: null };
  if (!NONCE.test(nonce)) return { ok: false, code: "SIGNATURE_INVALID", reason: "bad_nonce_format", key_id };
  if (!/^\d{9,11}$/.test(tsRaw)) return { ok: false, code: "SIGNATURE_INVALID", reason: "bad_timestamp_format", key_id };

  const key = keys.get(key_id);
  const secret = key?.secret ?? "unknown-key-dummy-secret-for-constant-time-compare";
  const expected = Buffer.from(computeSignature(secret, tsRaw, nonce, rawBody));
  const given = Buffer.from(sig);
  const sameLength = expected.length === given.length;
  const match = timingSafeEqual(expected, sameLength ? given : expected) && sameLength;
  if (!key) return { ok: false, code: "SIGNATURE_INVALID", reason: "unknown_key_id", key_id };
  if (!match) return { ok: false, code: "SIGNATURE_INVALID", reason: "signature_mismatch", key_id };

  const ts = Number(tsRaw);
  if (Math.abs(nowSec - ts) > maxSkewSec) {
    return { ok: false, code: "TIMESTAMP_OUT_OF_WINDOW", reason: "timestamp_outside_window", key_id };
  }
  return { ok: true, key, timestamp: ts, nonce };
}

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");
