import { GetQuoteApp } from "@/app/components/get-quote/get-quote-app";
import { buildRentalBusinessJsonLd } from "@/lib/website-positioning";
import { Suspense } from "react";

export default function GetQuotePage() {
  const jsonLd = buildRentalBusinessJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="sr-only">
        Party Perfect Event Rentals — Tulsa full-service event rental quotes
      </h1>
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--gq-muted)]">
            Loading quote options…
          </div>
        }
      >
        <GetQuoteApp />
      </Suspense>
    </>
  );
}
