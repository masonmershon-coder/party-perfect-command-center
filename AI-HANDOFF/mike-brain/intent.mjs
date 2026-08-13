// MIKE INTENT CLASSIFICATION — deterministic, no LLM at decision time.
//
// The acceptance test that produced this file: Mason texted
//   "Mike, check QuickBooks for 2025. Did we make a profit?"
// and got a canned stub. His phrasing was fine. THE FIX MUST NOT BE NEW SYNTAX.
// Requiring `status`, `/quickbooks`, or any magic command is a failed fix.
//
// What this file does NOT do: decide whether the work is allowed, who may approve it,
// or whether it is finished. Matter owns all of that. This only answers "what is being
// asked, and which subsystem owns it" so a durable task can be created.
//
// Unrecognized requests are a FIRST-CLASS OUTCOME. Mike asking one clarifying question
// is correct; silently guessing a subsystem is how a QuickBooks question becomes an
// inventory task.

/**
 * Domains Mike can route today. Each carries the subsystem the control plane already
 * knows, so routing reuses existing ownership rather than inventing a parallel map.
 */
export const DOMAINS = [
  {
    id: "accounting",
    subsystem: "accounting",
    owner_agent: "claude",
    match: /\b(quickbooks|qb|books|bookkeep\w*|profit|loss|p&l|net income|revenue|expenses?|reconcil\w*|invoice\w*|accounts? (receivable|payable)|a\/r|a\/p|tax(es)?|deposits?)\b/i,
    title: "Accounting question",
    // Financial answers must never be estimated. This flag reaches the task so the
    // executing agent inherits the constraint rather than relying on prompt wording.
    no_estimates: true,
  },
  {
    id: "por",
    subsystem: "por",
    owner_agent: "claude",
    match: /\b(point of rental|\bpor\b|counter|contract|quote|reservation|rental|deliver(y|ies)|pickup|item availability|inventory|kit)\b/i,
    title: "Point of Rental question",
  },
  {
    id: "hiring",
    subsystem: "hiring",
    owner_agent: "mike",
    match: /\b(hiring|applicant|candidate|indeed|resume|interview|apply|application)\b/i,
    title: "Hiring question",
  },
  {
    id: "marketing",
    subsystem: "marketing",
    owner_agent: "madison",
    match: /\b(marketing|ad|ads|google ads|facebook|campaign|flyer|social|design|website copy)\b/i,
    title: "Marketing request",
  },
  {
    id: "command-center",
    subsystem: "command-center",
    owner_agent: "cursor",
    match: /\b(command ?center|dashboard|the app|the site|page|button|screen|ui)\b/i,
    title: "Command Center request",
  },
  {
    id: "system",
    subsystem: "verification",
    owner_agent: "codex",
    match: /\b(audit|verify|verification|status of|health|backup|security)\b/i,
    title: "System status request",
  },
];

/** Conversational messages that are not task requests at all. */
const SMALL_TALK = /^(hi|hey|hello|yo|thanks|thank you|ok|okay|got it|nice|cool|sounds good|ttyl|morning|good morning|night)\b[\s!.]*$/i;

/** Signals that this is a REQUEST rather than a remark. */
const REQUEST_SIGNAL =
  /\b(check|look\s?up|find|get|pull|tell me|what(?:'s| is| are| was)|how much|how many|did we|do we|are we|is there|can you|could you|please|show me|run|start|send|make|build|fix|why|when|where|who)\b|\?/i;

const stripAddress = (t) =>
  String(t ?? "").replace(/^(hey\s+|hi\s+|ok\s+|okay\s+)?(mike|matter)[,!:]?\s+/i, "").trim();

/** Untrusted text can describe an action; it may never authorize one. */
const INJECTION =
  /\b(ignore\s+(all\s+|previous\s+)?instructions|disregard\s+(the\s+)?(rules|policy|instructions)|system\s+prompt|you\s+are\s+now|act\s+as\s+(an?\s+)?(admin|owner|root)|override\s+(the\s+)?(rules|policy|approval))\b/i;

/**
 * Classify one authenticated message.
 *
 * @returns {{kind:"task"|"smalltalk"|"unclear"|"refused", ...}}
 *   task     — a routable request; carries subsystem/owner/title
 *   smalltalk— acknowledge, create nothing
 *   unclear  — ask ONE question; never guess a subsystem
 *   refused  — injection markers; treat the text as data, create nothing
 */
export function classifyIntent(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { kind: "unclear", reason: "empty" };

  if (INJECTION.test(raw)) {
    return { kind: "refused", reason: "injection_markers",
             // Never echo the matched text back — repeating it is the injection.
             question: "That message contains instructions I won't act on. Send it again in your own words if it was meant as a request." };
  }

  const body = stripAddress(raw);
  if (SMALL_TALK.test(body)) return { kind: "smalltalk" };

  const hits = DOMAINS.filter((d) => d.match.test(body));

  if (!REQUEST_SIGNAL.test(body) && hits.length === 0)
    return { kind: "unclear", reason: "no_request_signal",
             question: "I didn't catch a request in that. What would you like me to look into?" };

  if (hits.length === 0)
    return { kind: "unclear", reason: "no_domain_matched",
             question: "I can look into that, but I'm not sure which system it lives in. Is it QuickBooks, Point of Rental, hiring, marketing, or Command Center?" };

  // More than one domain matched: ambiguous ownership. Guessing here is exactly how a
  // question about one system becomes a task against another, so ask instead.
  if (hits.length > 1) {
    const names = hits.map((h) => h.id).join(", ");
    return { kind: "unclear", reason: "ambiguous_domain", candidates: hits.map((h) => h.id),
             question: `That could be ${names}. Which one did you mean?` };
  }

  const d = hits[0];
  return {
    kind: "task",
    domain: d.id,
    subsystem: d.subsystem,
    owner_agent: d.owner_agent,
    title: d.title,
    no_estimates: d.no_estimates === true,
    // The request is carried as DATA for a human/agent to read at source. It is never
    // treated as instructions to Mike.
    request_summary: body.slice(0, 200),
  };
}
