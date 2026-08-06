/**
 * How Party Perfect (Josh/Michelle, Tulsa) chooses applicants.
 * Used by Mike scoring + chat so rankings match real warehouse staffing.
 */

export const HIRING_SELECTION_PLAYBOOK = `
# Party Perfect — how we choose applicants (Mike MUST follow)

Owners: Michelle & Josh Mershon · Tulsa event rentals warehouse + delivery + tents.

## Always hiring — every position

- We are **always hiring** for **all** roles when the candidate is a good fit:
  Tents · Delivery · Linen · Dish · Warehouse/dock · Showroom · Sales · Open/float.
- Do **not** tell Josh to “pause” showroom/sales recruiting as a blanket rule.
- Still **rank urgency** by season: tents + delivery volume is often hottest, but a great showroom/sales hire is still a flag if they fit.

## Onboarding path (tell labor/crew candidates the truth)

- New crew often **start on tents** (hot + hard = proves they’ll stick).
- If they hang → **ride-alongs** on delivery trucks.
- Front-of-house (showroom/sales) can start in lane if people skills + schedule fit — don’t force desks onto tents people or vice versa.
- Do **not** promise pure finance/admin as a first step for generic “open” labors unless that is what they applied for and we need it.

## What “good” looks like (score these UP by role)

**Any role:** 18+, eligible to work, clear communication, reliability signals, realistic Tulsa commute.
**Tents / Delivery / physical warehouse:** heavy lifting, outdoor heat, early mornings, flexible weekdays+weekends, driver’s license (strong for delivery path), grit history (warehouse/dock/moving/construction/kitchen pace).
**Showroom / Sales:** people skills, phones/quotes comfort, polished but friendly, schedule that covers showroom peaks.
**Linen / Dish:** standing endurance, pace, team attitude with department leads.

## What “weak” looks like (score DOWN — but prefer reject *with reason* from Josh)

- Vague or empty applications (“because yes”).
- Avoids outdoor/physical work **when** applying for tents/delivery/open crew.
- Schedule impossible for the role they want.
- Unreliable vibe, flaky history, no way to get to site.
- Pure desk/finance only for labor roles unless they explicitly want hard outdoor work.

## Learning from Hired / Rejected (critical)

- Josh closes every open app as **Hired** or **Rejected** with a required **why** — never silent delete.
- Those outcomes are stored and fed into scoring.
- **Hired reasons** = raise scores for apps with the same signals.
- **Rejected reasons** = lower scores / filter for the same patterns.
- Never invent why — use the feedback log. When advising, cite recent hired/rejected patterns.

## Interview / same-day actions (advise Josh)

Same day for 70+ / flagged (role-appropriate):
1. Text or call promptly.
2. Be honest about the work (especially tents/heat for crew).
3. Confirm schedule, transport, license if delivery path, start date.
4. Optional visual via search links only — never invent a match.
5. Fast no is fine — but always capture **why** in Hiring when deleting.

## Scoring guide (0–100)

- **85–100**: Strong hire-ready fit for *their* role track. Flag Josh / SMS.
- **70–84**: Solid call today. Flag.
- **55–69**: Maybe — review in Hiring.
- **40–54**: Weak / incomplete — don’t flag.
- **0–39**: Gates failed or clear mismatch.

Primary fit: recommend the best department. Open + physical → often Tents or Delivery first. Open + people-first → Showroom/Sales. Always hiring means good fits in *any* department get positive treatment.

## volume goal

Target **1–5 quality apps/day** via partyperfectjobs.com (Easy Apply off). Ads can still lead with physical roles; all roles remain open on the form.
`.trim();

/** Keywords that mark real crew fitness in free text. */
const PHYSICAL_SIGNALS =
  /\b(lift|lifting|heavy|outdoor|heat|hot|labor|warehouse|dock|moving|construction|landscap|tent|event setup|physical|stand(?:ing)? all day|farm|ranch|install|load(?:ing)? trucks?|framing|concrete|yard work)\b/i;

const DESK_ONLY_SIGNALS =
  /\b(finance analyst|accountant|bookkeep|office only|desk job|remote only|customer service only|phones only|no lifting|not physical)\b/i;

const CREW_EMPLOYER =
  /\b(walmart|warehouse|dock|moving|construction|landscap|tent|rental|event|install|gas station|caseys|cook|kitchen|farm|ranch|home depot|lowes|amazon|delivery)\b/i;

/**
 * Apply Party Perfect selection weights on top of a base heuristic score.
 */
export function applyHiringSelectionWeights(
  input: {
    roles: string[];
    city?: string;
    eligibleToWork?: string;
    over18?: string;
    validDriverLicense?: string;
    availability?: string;
    physicalAbility?: string;
    whyPartyPerfect?: string;
    experience?: string;
    workHistory?: Array<{
      employer?: string;
      roleTitle?: string;
    }>;
  },
  baseScore: number,
): { score: number; notes: string[] } {
  let score = baseScore;
  const notes: string[] = [];
  const text = [
    input.physicalAbility,
    input.whyPartyPerfect,
    input.experience,
    input.availability,
    ...(input.workHistory || []).flatMap((w) => [
      w.employer || "",
      w.roleTitle || "",
    ]),
  ]
    .join(" ")
    .toLowerCase();

  if (input.eligibleToWork === "no" || input.over18 === "no") {
    return {
      score: Math.min(score, 22),
      notes: ["Hard gate: must be 18+ and eligible to work"],
    };
  }

  const wantsCrew =
    input.roles.includes("tents") ||
    input.roles.includes("delivery") ||
    input.roles.includes("open") ||
    input.roles.includes("lines");
  const wantsFront =
    input.roles.includes("showroom") || input.roles.includes("sales");
  const onlyFront =
    wantsFront &&
    !input.roles.includes("tents") &&
    !input.roles.includes("delivery") &&
    !input.roles.includes("open") &&
    !input.roles.includes("lines");

  if (PHYSICAL_SIGNALS.test(text)) {
    score += 10;
    notes.push("Physical / outdoor language present");
  }
  if (DESK_ONLY_SIGNALS.test(text) && !PHYSICAL_SIGNALS.test(text)) {
    score -= 12;
    notes.push("Desk-leaning profile for current crew priority");
  }

  const historyBlob = (input.workHistory || [])
    .map((w) => `${w.employer} ${w.roleTitle}`)
    .join(" ");
  if (CREW_EMPLOYER.test(historyBlob) || CREW_EMPLOYER.test(text)) {
    score += 8;
    notes.push("Work history aligns with physical / pace work");
  }

  if (input.validDriverLicense === "yes" && wantsCrew) {
    score += 5;
    notes.push("License helps delivery path");
  }

  if (onlyFront) {
    // Always hiring all positions — don't punish showroom/sales picks.
    notes.push("Front-of-house interest (always hiring if fit)");
  }

  if (/\b(evenings?\s+and\s+weekends?|weekends?\s+only|evenings?\s+only)\b/i.test(
    input.availability || "",
  ) && wantsCrew) {
    score -= 6;
    notes.push("Narrow availability for tent/delivery volume");
  }

  if (/\b(mornings?|weekdays?|any|flexible|whatever the team needs|full time|full-time)\b/i.test(
    input.availability || "",
  )) {
    score += 5;
    notes.push("Flexible / daytime availability");
  }

  const city = (input.city || "").toLowerCase();
  if (
    city &&
    !/tulsa|broken arrow|bixby|jenks|owasso|sand springs|sapulpa|claremore|catoosa|collinsville|skiatook|glenpool/.test(
      city,
    )
  ) {
    // soft — e.g. Tahlequah still possible
    if (/tahlequah|okmulgee|muskogee|stillwater|oklahoma city|okc/.test(city)) {
      score -= 3;
      notes.push("Commute / out-of-metro check on call");
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { score, notes };
}
