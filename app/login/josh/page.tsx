import Link from "next/link";
import { PartyPerfectLogo } from "@/app/components/dashboard/party-perfect-logo";

export default function JoshLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--pp-bg)] px-6">
      <div className="pp-panel w-full max-w-md rounded-2xl p-8 text-center">
        <PartyPerfectLogo variant="compact" className="mx-auto" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] pp-accent-text">
          Josh&apos;s Inbox
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--pp-text)]">
          Dedicated login coming soon
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--pp-text-muted)]">
          Josh&apos;s GoDaddy mailbox (
          <span className="font-medium text-[var(--pp-text)]">
            info@mershonevents.com
          </span>
          ) is already separated in the Command Center Emails tab. A private
          login page will be added here later.
        </p>
        <p className="mt-3 text-xs text-[var(--pp-text-muted)]">
          For now, add{" "}
          <code className="rounded bg-[var(--pp-accent-muted)] px-1 py-0.5">
            EMAIL_JOSH_IMAP_PASSWORD
          </code>{" "}
          to <code className="rounded bg-[var(--pp-accent-muted)] px-1 py-0.5">.env.local</code>{" "}
          — never in source code.
        </p>
        <Link
          href="/?section=emails"
          className="pp-btn-primary mt-8 inline-block px-6 py-3 text-sm"
        >
          Open Emails in Command Center
        </Link>
      </div>
    </div>
  );
}
