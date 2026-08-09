/**
 * Known ?src= marketing channels for partyperfectjobs.com.
 * Unknown values are stored cleaned (max 40 chars) so new campaigns still track.
 */
export const JOB_LEAD_SOURCES = [
  { id: "indeed", label: "Indeed" },
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "truck-qr", label: "Truck QR" },
  { id: "referral", label: "Referral link" },
  { id: "google", label: "Google" },
  { id: "craigslist", label: "Craigslist" },
  { id: "tiktok", label: "TikTok" },
  { id: "college", label: "College" },
  { id: "direct", label: "Direct / unknown" },
] as const;

export type JobLeadSourceId = (typeof JOB_LEAD_SOURCES)[number]["id"];

export function normalizeJobLeadSource(raw: unknown): string {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (!v) return "direct";
  // Legacy site marker on old records
  if (v === "partyperfectjobs") return "direct";
  return v;
}

export function jobLeadSourceLabel(id: string): string {
  const known = JOB_LEAD_SOURCES.find((row) => row.id === id);
  if (known) return known.label;
  if (!id || id === "direct") return "Direct / unknown";
  return id;
}
