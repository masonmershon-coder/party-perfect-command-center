import { JobsApplication } from "@/app/components/jobs/jobs-application";
import { JOB_ROLES } from "@/lib/jobs";
import { Suspense } from "react";

/** Server shell + JobPosting JSON-LD so Safari/Google can find Party Perfect Jobs. */
export default function JobsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Party Perfect Event Rentals",
    url: "https://partyperfecteventrental.com",
    logo: "https://partyperfectjobs.com/party-perfect-logo.png",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Tulsa",
      addressRegion: "OK",
      addressCountry: "US",
    },
    hiringOrganization: {
      "@type": "Organization",
      name: "Party Perfect Event Rentals",
    },
  };

  const jobPostings = JOB_ROLES.map((role) => ({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: role.label,
    description: `${role.blurb}. Pay $18–$28/hr depending on role and experience.`,
    datePosted: "2026-07-01",
    employmentType: "FULL_TIME",
    hiringOrganization: {
      "@type": "Organization",
      name: "Party Perfect Event Rentals",
      sameAs: "https://partyperfecteventrental.com",
      logo: "https://partyperfectjobs.com/party-perfect-logo.png",
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Tulsa",
        addressRegion: "OK",
        addressCountry: "US",
      },
    },
    applicantLocationRequirements: {
      "@type": "Country",
      name: "US",
    },
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
    directApply: true,
    url: "https://partyperfectjobs.com/",
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostings) }}
      />
      {/* Crawlable heading for Safari/search (JobsApplication is client-only). */}
      <h1 className="sr-only">
        Party Perfect Jobs — Tulsa event rental careers · $18–$28/hr · Full application
      </h1>
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--jobs-muted)]">
            Loading application…
          </div>
        }
      >
        <JobsApplication />
      </Suspense>
    </>
  );
}
