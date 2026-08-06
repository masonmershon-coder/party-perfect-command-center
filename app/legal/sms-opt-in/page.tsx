export const metadata = {
  title: "SMS Opt-In · Party Perfect Event Rentals",
  description:
    "How Party Perfect owners and managers opt in to Mike operational SMS.",
};

export default function SmsOptInPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-[var(--pp-text)]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--pp-text-muted)]">
        Party Perfect Event Rentals · Tulsa
      </p>
      <h1 className="mt-2 text-3xl font-semibold">SMS Opt-In</h1>
      <p className="mt-2 text-sm text-[var(--pp-text-muted)]">
        Public consent documentation for Twilio / carrier review
      </p>

      <div className="mt-8 space-y-5 text-sm leading-7">
        <p>
          <strong>Who receives texts.</strong> Only Party Perfect Event Rentals
          owners and authorized managers who provide their mobile numbers for
          internal operations. This is not a consumer marketing list.
        </p>
        <p>
          <strong>How consent is collected (verbal / in-person).</strong> An
          owner or manager gives their mobile number to Party Perfect for Mike
          operational SMS during setup, and is told they will receive recurring
          business texts. They may also text <strong>START</strong> to our Mike
          Twilio number to confirm opt-in.
        </p>
        <p>
          <strong>What messages include.</strong> Task updates, hiring alerts,
          weekly recaps, and inbox priorities from Mike, our operations
          assistant. Message frequency varies (typically a few messages per
          week). Message and data rates may apply. Consent is not a condition of
          purchase.
        </p>
        <p>
          <strong>Opt out &amp; help.</strong> Reply <strong>STOP</strong> to
          cancel. Reply <strong>HELP</strong> for help. Support:{" "}
          <a
            className="underline"
            href="mailto:Rentals@partyperfecteventrental.com"
          >
            Rentals@partyperfecteventrental.com
          </a>
          .
        </p>
        <p>
          <strong>Legal.</strong>{" "}
          <a
            className="underline"
            href="https://partyperfect.app/legal/privacy"
          >
            Privacy Policy
          </a>{" "}
          ·{" "}
          <a
            className="underline"
            href="https://partyperfect.app/legal/terms"
          >
            SMS Terms &amp; Conditions
          </a>
          . We do not share mobile numbers or opt-in consent with third parties
          for their marketing or promotional purposes.
        </p>
        <p>
          Screenshot evidence for reviewers:{" "}
          <a
            className="underline"
            href="https://partyperfect.app/legal/sms-opt-in.png"
          >
            sms-opt-in.png
          </a>
          .
        </p>
      </div>
    </main>
  );
}
