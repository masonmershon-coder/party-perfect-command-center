export const metadata = {
  title: "Privacy Policy · Party Perfect Event Rentals",
  description: "Privacy policy for Party Perfect Event Rentals SMS and web services.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-[var(--pp-text)]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--pp-text-muted)]">
        Party Perfect Event Rentals
      </p>
      <h1 className="mt-2 text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-[var(--pp-text-muted)]">
        Last updated: July 27, 2026
      </p>

      <div className="mt-8 space-y-5 text-sm leading-7 text-[var(--pp-text)]">
        <p>
          Party Perfect Event Rentals (&quot;Party Perfect,&quot; &quot;we,&quot;
          &quot;us&quot;) operates the Party Perfect Command Center and related
          SMS alerts from Mike, our operations assistant, for business owners and
          authorized managers.
        </p>
        <p>
          <strong>Information we collect.</strong> When you opt in to SMS, we
          collect your mobile phone number, message content you send to us, and
          basic delivery metadata needed to operate the service.
        </p>
        <p>
          <strong>How we use information.</strong> We use your number and
          messages to send operational texts (task updates, hiring alerts,
          weekly recaps, inbox priorities) and to respond when you text Mike.
          Message frequency varies; you may receive several messages per week
          depending on business activity. Message and data rates may apply.
        </p>
        <p>
          <strong>No third-party sharing for marketing.</strong> We do not share
          mobile phone numbers, SMS opt-in consent, or messaging data with
          third parties or affiliates for their marketing or promotional
          purposes.
        </p>
        <p>
          <strong>Opt out.</strong> Reply <strong>STOP</strong> to cancel SMS.
          Reply <strong>HELP</strong> for help. You may also contact us at{" "}
          <a
            className="underline"
            href="mailto:Rentals@partyperfecteventrental.com"
          >
            Rentals@partyperfecteventrental.com
          </a>
          .
        </p>
        <p>
          <strong>Security &amp; retention.</strong> We retain SMS-related data
          only as long as needed for operations, troubleshooting, and legal
          requirements, then delete or de-identify it.
        </p>
        <p>
          Questions about this policy:{" "}
          <a
            className="underline"
            href="mailto:Rentals@partyperfecteventrental.com"
          >
            Rentals@partyperfecteventrental.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
