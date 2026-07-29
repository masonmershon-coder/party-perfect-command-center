import { createHash } from "crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getEmailAccount, getEmailAccounts } from "./email-accounts";
import { inferEmailPriority } from "./email-priority";
import { mergeImapEmails } from "./storage";
import type { EmailAccountId, EmailItem } from "./types";

const LOOKBACK_DAYS = 30;
const MAX_PER_MAILBOX = 40;

export interface MailboxSyncResult {
  accountId: EmailAccountId;
  label: string;
  ok: boolean;
  fetched: number;
  added: number;
  error?: string;
}

export interface EmailSyncReport {
  syncedAt: string;
  mode: "live" | "demo";
  results: MailboxSyncResult[];
  addedTotal: number;
  highPriorityNew: EmailItem[];
}

function passwordFor(accountId: EmailAccountId): string | undefined {
  const map: Record<EmailAccountId, string | undefined> = {
    company: process.env.EMAIL_COMPANY_IMAP_PASSWORD?.trim(),
    josh: process.env.EMAIL_JOSH_IMAP_PASSWORD?.trim(),
    michelle: process.env.EMAIL_MICHELLE_IMAP_PASSWORD?.trim(),
  };
  return map[accountId] || undefined;
}

function stableId(accountId: EmailAccountId, messageId: string) {
  const hash = createHash("sha256")
    .update(`${accountId}:${messageId}`)
    .digest("hex")
    .slice(0, 32);
  return `imap-${accountId}-${hash}`;
}

function parseAddress(value?: {
  name?: string;
  address?: string;
} | null): { name: string; email: string } {
  return {
    name: value?.name?.trim() || value?.address?.trim() || "Unknown",
    email: value?.address?.trim() || "",
  };
}

async function fetchMailbox(
  accountId: EmailAccountId,
): Promise<{ emails: EmailItem[]; error?: string }> {
  const account = getEmailAccount(accountId);
  const password = passwordFor(accountId);

  if (!account || !password) {
    return { emails: [], error: "Password not configured" };
  }

  const host = process.env.IMAP_HOST?.trim() || "imap.secureserver.net";
  const port = Number(process.env.IMAP_PORT ?? "993");

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: {
      user: account.address,
      pass: password,
    },
    logger: false,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
  });

  const emails: EmailItem[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const since = new Date();
      since.setDate(since.getDate() - LOOKBACK_DAYS);

      const uids = await client.search({ since }, { uid: true });
      const recent = (uids || []).slice(-MAX_PER_MAILBOX);

      if (recent.length === 0) {
        return { emails: [] };
      }

      for await (const msg of client.fetch(
        recent,
        {
          uid: true,
          envelope: true,
          source: true,
          flags: true,
        },
        { uid: true },
      )) {
        const envelope = msg.envelope;
        const from = parseAddress(envelope?.from?.[0]);
        const subject = envelope?.subject?.trim() || "(no subject)";
        const receivedAt = (
          envelope?.date || new Date()
        ).toISOString();

        let body = "";
        let preview = "";

        if (msg.source) {
          try {
            const parsed = await simpleParser(msg.source);
            body =
              (typeof parsed.text === "string" && parsed.text.trim()) ||
              (typeof parsed.html === "string"
                ? parsed.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
                : "") ||
              "";
            preview = body.slice(0, 180);
          } catch {
            preview = subject;
            body = subject;
          }
        } else {
          preview = subject;
          body = subject;
        }

        const messageId =
          envelope?.messageId?.trim() ||
          `uid-${accountId}-${msg.uid}-${receivedAt}`;

        const flags = msg.flags ? Array.from(msg.flags) : [];
        const seen = flags.some((flag) => flag.toLowerCase() === "\\seen");

        const priority = inferEmailPriority(subject, preview);
        const nowIso = new Date().toISOString();

        emails.push({
          id: stableId(accountId, messageId),
          accountId,
          subject,
          sender: from.name,
          senderEmail: from.email,
          preview: preview || subject,
          body: body || subject,
          receivedAt,
          status: seen ? "read" : "unread",
          priority,
          messageId,
          source: "imap",
          updatedAt: nowIso,
        });
      }
    } finally {
      lock.release();
    }

    try {
      await client.logout();
    } catch {
      // ignore logout errors
    }

    return { emails };
  } catch (error) {
    try {
      client.close();
    } catch {
      // ignore
    }
    const err = error as {
      message?: string;
      responseText?: string;
      authenticationFailed?: boolean;
      serverResponseCode?: string;
    };
    const detail =
      err.responseText ||
      err.serverResponseCode ||
      err.message ||
      "IMAP connection failed";
    const message = err.authenticationFailed
      ? `Authentication failed for ${account.address}. Update EMAIL_*_IMAP_PASSWORD in env.`
      : detail;
    return { emails: [], error: message };
  }
}

/** Sync all configured GoDaddy mailboxes into local/store emails. */
export async function syncAllEmailInboxes(): Promise<EmailSyncReport> {
  const accounts = getEmailAccounts().filter((account) =>
    Boolean(passwordFor(account.id)),
  );

  if (accounts.length === 0) {
    return {
      syncedAt: new Date().toISOString(),
      mode: "demo",
      results: [],
      addedTotal: 0,
      highPriorityNew: [],
    };
  }

  const results: MailboxSyncResult[] = [];
  const allFetched: EmailItem[] = [];
  const syncedAccountIds: EmailAccountId[] = [];

  for (const account of accounts) {
    const { emails, error } = await fetchMailbox(account.id);
    if (error) {
      results.push({
        accountId: account.id,
        label: account.label,
        ok: false,
        fetched: 0,
        added: 0,
        error,
      });
      continue;
    }

    syncedAccountIds.push(account.id);
    allFetched.push(...emails);
    results.push({
      accountId: account.id,
      label: account.label,
      ok: true,
      fetched: emails.length,
      added: 0,
    });
  }

  const { added, highPriorityNew, addedByAccount } = await mergeImapEmails(
    allFetched,
    syncedAccountIds,
  );

  for (const result of results) {
    if (!result.ok) continue;
    result.added = addedByAccount[result.accountId] ?? 0;
  }

  return {
    syncedAt: new Date().toISOString(),
    mode: "live",
    results,
    addedTotal: added,
    highPriorityNew,
  };
}
