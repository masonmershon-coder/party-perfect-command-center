// Audio MIME acceptance — explicit allowlist, fail closed.
//
// This mirrors the Codex finding `unsupported-mime-queued` on Talk-to-Mike: there, an
// unsupported type normalized to null, the surrounding condition short-circuited to
// false, and the object was queued anyway. The lesson is that "unknown" must be its
// own REJECT outcome, never an absence that reads as permission.
const ACCEPTED = new Set(["audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac", "audio/mpeg", "audio/wav"]);

export function acceptAudioType(contentType) {
  const raw = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!raw) return { ok: false, code: "unsupported_media_type", reason: "no content type supplied" };
  if (!ACCEPTED.has(raw)) return { ok: false, code: "unsupported_media_type", reason: `'${raw}' is not an accepted audio type` };
  return { ok: true, normalized: raw };
}

export default { acceptAudioType, ACCEPTED };
