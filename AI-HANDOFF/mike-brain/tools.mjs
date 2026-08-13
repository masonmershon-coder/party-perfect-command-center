// MIKE'S TRUSTED TOOLS — live POR-backed data only.
//
// THE STALE-DATA RULE, enforced structurally rather than by wording:
//
//   For "today / current / now / open / available / outstanding" questions, Mike answers
//   from the LIVE path (POR -> sync agent -> Redis -> Command Center) or he answers
//   "I don't have current data". He NEVER falls back to the SSD export.
//
// The SSD dump (2026-08-10_POR-FULL-DATA) is historical/bootstrap/research data. It is
// perfectly good for "how did we do last year"; presenting it as today's numbers is a
// failed acceptance test. This file therefore contains NO path to the SSD at all — the
// guarantee is the absence of the capability, not a promise to be careful.
//
// Two systems, two jobs, deliberately not merged:
//   LIVE      POR -> Redis      -> current operational answers
//   DURABLE   POR -> SSD        -> history, research, bootstrap

/** Intent words that demand current data. Anything matching MUST use the live path. */
const CURRENCY_WORDS =
  /\b(today|todays|today's|tonight|current|currently|now|right now|open|still out|outstanding|available|remaining|this (morning|afternoon|week)|so far)\b/i;

export const needsCurrentData = (text) => CURRENCY_WORDS.test(String(text ?? ""));

/** A live answer older than this is not "current" and must not be presented as such. */
export const MAX_FRESH_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch the live POR snapshot through Command Center.
 * Returns a discriminated result — never throws into the answer path, because an
 * exception that gets swallowed upstream is how "unavailable" turns into a wrong number.
 */
export async function fetchLiveSnapshot({ fetchImpl = fetch, baseUrl = "https://partyperfect.app", timeoutMs = 12000 } = {}) {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetchImpl(`${baseUrl}/api/health`, { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, code: "LIVE_UNAVAILABLE", detail: `health ${res.status}` };
    const h = await res.json();

    if (!h.porSyncConfigured) return { ok: false, code: "LIVE_NOT_CONFIGURED" };
    if (!h.porSnapshotPresent) return { ok: false, code: "LIVE_NO_SNAPSHOT" };

    const syncedAt = h.porSyncedAt ? Date.parse(h.porSyncedAt) : NaN;
    const ageMs = Number.isFinite(syncedAt) ? Date.now() - syncedAt : null;

    // "veryStale"/"stale" from the service, or our own ceiling — whichever objects first.
    if (h.porSnapshotVeryStale || h.porSnapshotStale || (ageMs != null && ageMs > MAX_FRESH_MS)) {
      return { ok: false, code: "LIVE_STALE", ageMinutes: ageMs == null ? null : Math.round(ageMs / 60000),
               freshness: h.porSnapshotFreshness ?? null };
    }
    return { ok: true, health: h, syncedAt: h.porSyncedAt, ageMinutes: ageMs == null ? null : Math.round(ageMs / 60000),
             freshness: h.porSnapshotFreshness ?? null };
  } catch (err) {
    return { ok: false, code: "LIVE_UNREACHABLE", detail: String(err?.message || err).slice(0, 120) };
  }
}

/**
 * Read one operational field from a live snapshot.
 *
 * A field that is ABSENT is its own outcome. The snapshot carries ops.deliveriesToday
 * as a count but no per-ticket detail, so "what deliveries are still open" cannot be
 * answered from it — and saying "the field isn't there" is the correct answer, not a
 * reason to reach for the SSD or to infer a list from a number.
 */
export function readOpsField(snapshot, field) {
  const ops = snapshot?.ops;
  if (!ops || typeof ops !== "object") return { ok: false, code: "NO_OPS_SECTION" };
  if (!(field in ops)) return { ok: false, code: "FIELD_NOT_PRESENT", field };
  const value = ops[field];
  if (value == null) return { ok: false, code: "FIELD_NULL", field };
  return { ok: true, field, value };
}

/**
 * The answer gate. Given a question and a live result, decide what Mike may say.
 * This is the single place the stale-data rule is applied.
 */
export function answerFor({ question, live, snapshot, field }) {
  const current = needsCurrentData(question);

  if (!live.ok) {
    // For a current-data question there is no acceptable substitute. Say so plainly.
    const why = {
      LIVE_UNAVAILABLE: "Command Center didn't answer",
      LIVE_UNREACHABLE: "I couldn't reach Command Center",
      LIVE_NOT_CONFIGURED: "the POR sync isn't configured",
      LIVE_NO_SNAPSHOT: "there's no POR snapshot yet",
      LIVE_STALE: `the POR snapshot is ${live.ageMinutes ?? "?"} minutes old`,
    }[live.code] || "the live data isn't available";

    return {
      answerable: false,
      code: live.code,
      text: current
        ? `I can't answer that right now — ${why}, so I don't have current Point of Rental data. I'm not going to give you an older number and call it today's.`
        : `I can't answer that right now — ${why}.`,
    };
  }

  const read = readOpsField(snapshot, field);
  if (!read.ok) {
    return {
      answerable: false,
      code: read.code,
      text: read.code === "FIELD_NOT_PRESENT"
        ? `The live POR snapshot doesn't carry that detail (${field}), so I can't answer it from current data. It would need a new field in the sync.`
        : `That value isn't present in the current POR snapshot, so I can't answer it.`,
    };
  }

  return {
    answerable: true,
    value: read.value,
    freshness: live.freshness,
    syncedAt: live.syncedAt,
    ageMinutes: live.ageMinutes,
    source: "live POR via Command Center",
  };
}

/** Compose the outbound sentence, always naming the source and its age. */
export function formatAnswer(label, result) {
  if (!result.answerable) return result.text;
  return `${label}: ${result.value}. Source: ${result.source}, synced ${result.ageMinutes ?? "?"} min ago.`;
}

/** Map a question to the snapshot field that answers it. Null = not answerable today. */
export function fieldForQuestion(text) {
  const q = String(text ?? "");
  if (/\bdeliver/i.test(q) && /\b(how many|count|number of|total)\b/i.test(q)) return "deliveriesToday";
  if (/\bdeliver/i.test(q) && needsCurrentData(q)) return "deliveriesToday";
  if (/\breturn/i.test(q)) return "returnsDueToday";
  if (/\bopen (contracts|tickets)\b/i.test(q)) return "openContracts";
  return null;
}
