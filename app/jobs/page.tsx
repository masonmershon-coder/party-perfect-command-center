import { JobsApplication } from "@/app/components/jobs/jobs-application";
import {
  buildJobPostingJsonLd,
  buildJobsOrganizationJsonLd,
} from "@/lib/job-postings-schema";
import { Suspense } from "react";

/** Server shell + JobPosting JSON-LD so Safari/Google can find Party Perfect Jobs. */
export default function JobsPage() {
  const jsonLd = buildJobsOrganizationJsonLd();
  const jobPostings = buildJobPostingJsonLd();

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
