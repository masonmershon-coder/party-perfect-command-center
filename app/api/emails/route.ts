import {
  getEmailAccounts,
  getEmailConnectionInfo,
} from "@/lib/email-accounts";
import { listEmails } from "@/lib/storage";
import type { EmailAccountId } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId") as EmailAccountId | null;
  const includeArchived = searchParams.get("includeArchived") === "true";

  const emails = await listEmails(accountId ?? undefined);
  const visibleEmails = includeArchived
    ? emails
    : emails.filter((email) => email.status !== "archived");

  return NextResponse.json({
    accounts: getEmailAccounts(),
    connection: getEmailConnectionInfo(),
    emails: visibleEmails,
  });
}
