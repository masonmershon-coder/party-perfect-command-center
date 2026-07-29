import {
  getEmailAccounts,
  getEmailConnectionInfo,
} from "@/lib/email-accounts";
import { syncAllEmailInboxes } from "@/lib/imap-sync";
import { listEmails } from "@/lib/storage";
import type { EmailAccountId } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId") as EmailAccountId | null;
  const includeArchived = searchParams.get("includeArchived") === "true";
  const shouldSync = searchParams.get("sync") !== "0";

  let sync = null;
  if (shouldSync && getEmailConnectionInfo().configuredAccountCount > 0) {
    try {
      sync = await syncAllEmailInboxes();
    } catch (error) {
      sync = {
        syncedAt: new Date().toISOString(),
        mode: "demo" as const,
        results: [],
        addedTotal: 0,
        highPriorityNew: [],
        error: error instanceof Error ? error.message : "Sync failed",
      };
    }
  }

  const emails = await listEmails(accountId ?? undefined);
  const visibleEmails = includeArchived
    ? emails
    : emails.filter((email) => email.status !== "archived");

  return NextResponse.json({
    accounts: getEmailAccounts(),
    connection: getEmailConnectionInfo(),
    emails: visibleEmails,
    sync,
  });
}
