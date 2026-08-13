import type { JobApplication } from "@/lib/jobs";
import { roleLabel } from "@/lib/jobs";

/** Public search links so Josh can open possible photos — never claim a match without confirmation. */
export function candidateSocialSearchLinks(app: {
  fullName: string;
  city?: string;
}): {
  label: string;
  url: string;
}[] {
  const name = app.fullName.trim();
  const city = (app.city || "Tulsa").trim();
  const q = `${name} ${city}`;
  const enc = encodeURIComponent(q);
  const nameEnc = encodeURIComponent(name);
  return [
    {
      label: "Google Images",
      url: `https://www.google.com/search?tbm=isch&q=${enc}`,
    },
    {
      label: "Facebook people",
      url: `https://www.facebook.com/search/people/?q=${nameEnc}`,
    },
    {
      label: "Instagram",
      url: `https://www.instagram.com/explore/search/keyword/?q=${nameEnc}`,
    },
    {
      label: "LinkedIn",
      url: `https://www.linkedin.com/search/results/people/?keywords=${enc}`,
    },
    {
      label: "Google web",
      url: `https://www.google.com/search?q=${enc}`,
    },
  ];
}

export function formatHiringAppsForMike(
  applications: JobApplication[],
  options?: { quickIndexCap?: number; detailCap?: number },
): string {
  const quickIndexCap = options?.quickIndexCap ?? 40;
  const detailCap = options?.detailCap ?? 12;

  if (applications.length === 0) {
    return [
      "Hiring (partyperfectjobs.com): no applications in Redis yet.",
      "Daily goal: 25 apps (Tulsa day). See docs/HIRING_OUTREACH.md.",
    ].join("\n");
  }

  const sorted = [...applications].sort((a, b) => {
    if (a.mike.flagForJosh !== b.mike.flagForJosh) {
      return a.mike.flagForJosh ? -1 : 1;
    }
    return b.mike.score - a.mike.score;
  });

  const lines: string[] = [
    "Hiring applicants (from partyperfectjobs.com — live Command Center list):",
    `Total in store: ${applications.length}. Quick-index capped at ${quickIndexCap}; when Josh asks about a name beyond the index, say you’ll pull them from Hiring — do not invent.`,
    "PHOTO PROTOCOL: paste the social search URLs below — never claim you cannot find images.",
    "Rank for CURRENT need: tents/delivery physical grit first; desk/showroom secondary.",
    "You cannot open private Facebook/Instagram logins. Common-name collisions → use city + work history.",
    "",
  ];

  lines.push(`Quick index (top ${Math.min(quickIndexCap, sorted.length)} by flag/score → score · city · phone):`);
  for (const app of sorted.slice(0, quickIndexCap)) {
    lines.push(
      `  ${app.fullName} · ${app.mike.score}${app.mike.flagForJosh ? "*" : ""} · ${app.city || "—"} · ${app.phone || "—"}`,
    );
  }
  lines.push("");

  const detail = sorted.slice(0, detailCap);
  lines.push(`Detail cards (top ${detail.length} — ask for a name to expand others):`);
  for (const app of detail) {
    const links = candidateSocialSearchLinks(app)
      .map((l) => `${l.label}: ${l.url}`)
      .join("\n    ");
    const jobs = (app.workHistory || [])
      .slice(0, 3)
      .map(
        (w) =>
          `${w.employer || "?"} / ${w.roleTitle || "?"} (${w.startDate || "?"}–${w.stillEmployed ? "present" : w.endDate || "?"})`,
      )
      .join("; ");

    lines.push(
      [
        `• ${app.fullName} | score ${app.mike.score}${app.mike.flagForJosh ? " FLAGGED" : ""} | ${app.city || "—"}`,
        `  roles: ${app.roles.map(roleLabel).join(", ") || "—"} | fit: ${app.mike.primaryFit}`,
        `  phone: ${app.phone || "—"} | email: ${app.email || "—"} | license: ${app.validDriverLicense || "—"}`,
        `  source: ${app.source || "direct"} | scoredBy: ${app.mike.scoredBy}${app.mike.fallbackReason ? ` (${app.mike.fallbackReason})` : ""}`,
        `  transport: ${app.hasReliableTransport || "—"} | outdoor/50lb: ${app.physicalOutdoorOk || "—"}`,
        `  avail: ${(app.availability || "—").slice(0, 120)}`,
        `  why: ${(app.whyPartyPerfect || "—").slice(0, 140)}`,
        `  work: ${jobs || "—"}`,
        `  mike: ${app.mike.summary}`,
        `  PHOTO / SOCIAL SEARCH (paste these for Josh):`,
        `    ${links}`,
      ].join("\n"),
    );
  }

  return lines.join("\n");
}
