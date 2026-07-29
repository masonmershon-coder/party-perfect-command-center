export const metadata = {
  title: "SMS Terms · Party Perfect Event Rentals",
  description:
    "Terms and conditions for Party Perfect Event Rentals Mike SMS alerts.",
};

export default function SmsTermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-[var(--pp-text)]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--pp-text-muted)]">
        Party Perfect Event Rentals
      </p>
      <h1 className="mt-2 text-3xl font-semibold">SMS Terms &amp; Conditions</h1>
      <p className="mt-2 text-sm text-[var(--pp-text-muted)]">
        Last updated: July 27, 2026
      </p>

      <div className="mt-8 space-y-5 text-sm leading-7 text-[var(--pp-text)]">
        <p>
          By opting in to texts from Mike (Party Perfect Event Rentals operations
          assistant), you agree to receive recurring automated and conversational
          SMS messages related to business operations, including task updates,
          hiring alerts, weekly recaps, and inbox priorities.
        </p>
        <p>
          <strong>Consent.</strong> You provide consent by giving your mobile
          number to Party Perfect for operational alerts and/or by texting{" "}
          <strong>START</strong> to our Twilio number. Consent is not a
          condition of purchase.
        </p>
        <p>
          <strong>Frequency &amp; rates.</strong> Message frequency varies
          (typically a few messages per week). Message and data rates may apply.
        </p>
        <p>
          <strong>Opt out &amp; help.</strong> Reply <strong>STOP</strong> to
          unsubscribe. Reply <strong>HELP</strong> for help. Support:{" "}
          <a
            className="underline"
            href="mailto:Rentals@partyperfecteventrental.com"
          >
            Rentals@partyperfecteventrental.com
          </a>
          .
        </p>
        <p>
          <strong>Carriers.</strong> Carriers are not liable for delayed or
          undelivered messages.
        </p>
        <p>
          <strong>Privacy.</strong> See our{" "}
          <a className="underline" href="/legal/privacy">
            Privacy Policy
          </a>
          . We do not share mobile numbers or opt-in consent with third parties
          for their marketing or promotional purposes.
        </p>
      </div>
    </main>
  );
}
