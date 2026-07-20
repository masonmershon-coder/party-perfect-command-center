import type { EmailAccountId } from "./types";

export interface EmailAccount {
  id: EmailAccountId;
  label: string;
  address: string;
  description: string;
  provider: "godaddy";
  passwordConfigured: boolean;
  /** Future dedicated login route (Josh & Michelle). */
  futureLoginPath?: string;
}

export interface EmailConnectionInfo {
  mode: "demo" | "live";
  message: string;
  imapHost: string;
  imapPort: number;
  configuredAccountCount: number;
  googleOAuthConfigured: boolean;
  microsoftOAuthConfigured: boolean;
}

const GODADDY_IMAP_HOST =
  process.env.IMAP_HOST ?? "imap.secureserver.net";
const GODADDY_IMAP_PORT = Number(process.env.IMAP_PORT ?? "993");

/**
 * GoDaddy Workspace Email — one mailbox per account.
 * Usernames (addresses) can default here; passwords ONLY in .env.local.
 *
 *   IMAP_HOST=imap.secureserver.net
 *   IMAP_PORT=993
 *
 *   EMAIL_COMPANY_ADDRESS=Rentals@partyperfecteventrental.com
 *   EMAIL_COMPANY_IMAP_PASSWORD=
 *
 *   EMAIL_JOSH_ADDRESS=info@mershonevents.com
 *   EMAIL_JOSH_IMAP_PASSWORD=
 *
 *   EMAIL_MICHELLE_ADDRESS=michelle@partyperfecteventrental.com
 *   EMAIL_MICHELLE_IMAP_PASSWORD=
 *
 * Never commit passwords. Rotate any password shared in chat or tickets.
 *
 * Future: /login/josh and /login/michelle for per-user dashboard access.
 */
function passwordConfiguredFor(accountId: EmailAccountId) {
  const envKeys: Record<EmailAccountId, string | undefined> = {
    company: process.env.EMAIL_COMPANY_IMAP_PASSWORD,
    josh: process.env.EMAIL_JOSH_IMAP_PASSWORD,
    michelle: process.env.EMAIL_MICHELLE_IMAP_PASSWORD,
  };

  return Boolean(envKeys[accountId]?.trim());
}

export function getEmailAccounts(): EmailAccount[] {
  return [
    {
      id: "company",
      label: "General",
      address:
        process.env.EMAIL_COMPANY_ADDRESS ??
        "Rentals@partyperfecteventrental.com",
      description: "Main rentals inbox — quotes, bookings, client inquiries",
      provider: "godaddy",
      passwordConfigured: passwordConfiguredFor("company"),
    },
    {
      id: "josh",
      label: "Josh",
      address: process.env.EMAIL_JOSH_ADDRESS ?? "info@mershonevents.com",
      description: "Josh's GoDaddy inbox — operations, vendors, logistics",
      provider: "godaddy",
      passwordConfigured: passwordConfiguredFor("josh"),
      futureLoginPath: "/login/josh",
    },
    {
      id: "michelle",
      label: "Michelle",
      address:
        process.env.EMAIL_MICHELLE_ADDRESS ??
        "michelle@partyperfecteventrental.com",
      description: "Michelle's inbox — design consults, client styling",
      provider: "godaddy",
      passwordConfigured: passwordConfiguredFor("michelle"),
      futureLoginPath: "/login/michelle",
    },
  ];
}

export function getEmailConnectionInfo(): EmailConnectionInfo {
  const accounts = getEmailAccounts();
  const configuredAccountCount = accounts.filter(
    (account) => account.passwordConfigured,
  ).length;
  const live = configuredAccountCount > 0;

  return {
    mode: live ? "live" : "demo",
    imapHost: GODADDY_IMAP_HOST,
    imapPort: GODADDY_IMAP_PORT,
    configuredAccountCount,
    message: live
      ? `${configuredAccountCount}/3 GoDaddy mailboxes configured via .env.local. Live IMAP sync can be enabled next.`
      : "Demo inbox active. Add GoDaddy IMAP passwords to .env.local (one per mailbox) — never in source code.",
    googleOAuthConfigured: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
    microsoftOAuthConfigured: Boolean(process.env.MICROSOFT_OAUTH_CLIENT_ID),
  };
}

export function getEmailAccount(id: EmailAccountId): EmailAccount | undefined {
  return getEmailAccounts().find((account) => account.id === id);
}
