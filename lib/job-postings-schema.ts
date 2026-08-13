import { JOB_ROLES, type JobRoleId } from "@/lib/jobs";

/** Warehouse / HQ — used for Google for Jobs JobPosting. */
export const JOBS_ORG = {
  name: "Party Perfect Event Rental",
  legalName: "Party Perfect Event Rentals",
  url: "https://www.partyperfecteventrental.com",
  jobsUrl: "https://partyperfectjobs.com/",
  logo: "https://partyperfectjobs.com/party-perfect-logo.png",
  telephone: "+19182587368",
  streetAddress: "8401 E 41st St",
  addressLocality: "Tulsa",
  addressRegion: "OK",
  postalCode: "74145",
  addressCountry: "US",
} as const;

const ROLE_DESCRIPTIONS: Record<Exclude<JobRoleId, "open">, string> = {
  tents:
    "Build and tear down tent structures for events. Hot outdoor work, heavy lifting (50+ lbs), early starts. New crew often start on tents — grit and reliability matter most.",
  warehouse:
    "Pull, prep, and move inventory in our Tulsa warehouse and dock. Physical pace, teamwork, and reliable weekday/weekend coverage.",
  delivery:
    "Load trucks, deliver, and set event rentals across the Tulsa metro. Valid driver’s license preferred; lifting, outdoor work, early mornings, and flexible weekday/weekend schedules.",
  linen:
    "Prep linens and related inventory in our Tulsa warehouse — pace, standing endurance, and team attitude with department leads. Indoor warehouse environment with physical work.",
  dish:
    "Wash, polish, and prep china/glass for events. Fast-paced dish room with standing work and attention to detail.",
  deco:
    "Style décor and event looks with the décor team. Hands-on warehouse and showroom support with creative eye and reliable schedule.",
  leadership:
    "Lead crews and grow into management at Party Perfect Event Rentals (Tulsa). Prior supervisory or lead experience preferred; physical event work still part of the job.",
};

/** Roles that get a Google JobPosting (exclude open/float). */
export const GOOGLE_JOB_ROLE_IDS = JOB_ROLES.filter(
  (r) => r.id !== "open",
) as Array<(typeof JOB_ROLES)[number] & { id: Exclude<JobRoleId, "open"> }>;

/**
 * schema.org JobPosting objects for Google for Jobs / rich results.
 * One posting per open role; directApply to partyperfectjobs.com.
 */
export function buildJobPostingJsonLd(datePosted = "2026-08-01") {
  const org = {
    "@type": "Organization" as const,
    name: JOBS_ORG.name,
    sameAs: JOBS_ORG.url,
    logo: JOBS_ORG.logo,
    url: JOBS_ORG.url,
  };

  const place = {
    "@type": "Place" as const,
    address: {
      "@type": "PostalAddress" as const,
      streetAddress: JOBS_ORG.streetAddress,
      addressLocality: JOBS_ORG.addressLocality,
      addressRegion: JOBS_ORG.addressRegion,
      postalCode: JOBS_ORG.postalCode,
      addressCountry: JOBS_ORG.addressCountry,
    },
  };

  return GOOGLE_JOB_ROLE_IDS.map((role) => ({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: `${role.label} — Party Perfect Event Rental (Tulsa)`,
    description: ROLE_DESCRIPTIONS[role.id],
    identifier: {
      "@type": "PropertyValue",
      name: JOBS_ORG.name,
      value: `pp-jobs-${role.id}`,
    },
    datePosted,
    validThrough: "2027-08-01",
    employmentType: "FULL_TIME",
    hiringOrganization: org,
    jobLocation: place,
    applicantLocationRequirements: {
      "@type": "Country",
      name: "US",
    },
    directApply: true,
    url: `${JOBS_ORG.jobsUrl}?src=google&role=${role.id}`,
    baseSalary: {
      "@type": "MonetaryAmount",
      currency: "USD",
      value: {
        "@type": "QuantitativeValue",
        minValue: 18,
        maxValue: 28,
        unitText: "HOUR",
      },
    },
  }));
}

export function buildJobsOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: JOBS_ORG.legalName,
    url: JOBS_ORG.url,
    logo: JOBS_ORG.logo,
    telephone: JOBS_ORG.telephone,
    address: {
      "@type": "PostalAddress",
      streetAddress: JOBS_ORG.streetAddress,
      addressLocality: JOBS_ORG.addressLocality,
      addressRegion: JOBS_ORG.addressRegion,
      postalCode: JOBS_ORG.postalCode,
      addressCountry: JOBS_ORG.addressCountry,
    },
  };
}
