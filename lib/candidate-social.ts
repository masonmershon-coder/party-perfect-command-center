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
    "When Josh asks about a candidate by name, use this data + the hiring selection playbook.",
    "Rank for CURRENT need: tents/delivery physical grit first; desk/showroom secondary.",
    "You cannot open private Facebook/Instagram logins. To help with a visual/photo:",
    "1) Give a short fit recap (call today vs park) from the application + score.",
    "2) Return the search URLs below for that person (never invent a profile photo or claim a match without Josh confirming).",
    "3) Note common name collisions — city + work history is how Josh verifies.",
    "",
  ];

  for (const app of sorted.slice(0, 40)) {
    const links = candidateSocialSearchLinks(app)
      .map((l) => `${l.label}: ${l.url}`)
      .join(" | ");
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
        `  social search: ${links}`,
      ].join("\n"),
    );
  }

  return lines.join("\n");
}
