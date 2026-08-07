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

export function formatHiringAppsForMike(applications: JobApplication[]): string {
  if (applications.length === 0) {
    return [
      "Hiring (partyperfectjobs.com): no applications in Redis yet.",
      "Daily goal: 1–5 apps (Tulsa day). See docs/HIRING_OUTREACH.md.",
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
    `Total in store: ${applications.length}. When Josh asks about a name, fuzzy-match here (first name OK).`,
    "PHOTO PROTOCOL: paste the social search URLs below — never claim you cannot find images.",
    "Rank for CURRENT need: tents/delivery physical grit first; desk/showroom secondary.",
    "You cannot open private Facebook/Instagram logins. Common-name collisions → use city + work history.",
    "",
  ];

  // Full roster (compact) so name lookups don't miss people past the detail window.
  lines.push("Quick index (name → score · city · phone):");
  for (const app of sorted) {
    lines.push(
      `  ${app.fullName} · ${app.mike.score}${app.mike.flagForJosh ? "*" : ""} · ${app.city || "—"} · ${app.phone || "—"}`,
    );
  }
  lines.push("");

  // Rich detail for top / flagged first (cap keeps prompt sane).
  const detail = sorted.slice(0, 60);
  lines.push(`Detail cards (top ${detail.length} by flag/score):`);
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
        `  avail: ${(app.availability || "—").slice(0, 120)}`,
        `  work: ${jobs || "—"}`,
        `  mike: ${app.mike.summary}`,
        `  PHOTO / SOCIAL SEARCH (paste these for Josh):`,
        `    ${links}`,
      ].join("\n"),
    );
  }

  return lines.join("\n");
}
