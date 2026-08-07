/**
 * One-shot: sync GoDaddy IMAP and print Tiffany / PR hosting hits.
 *
 * Requires IMAP credentials in `.env.local` (never hardcode passwords):
 *   IMAP_HOST, IMAP_PORT
 *   EMAIL_COMPANY_ADDRESS, EMAIL_COMPANY_IMAP_PASSWORD
 *   EMAIL_JOSH_ADDRESS, EMAIL_JOSH_IMAP_PASSWORD
 *   EMAIL_MICHELLE_ADDRESS, EMAIL_MICHELLE_IMAP_PASSWORD
 *
 *   npx tsx --env-file=.env.local scripts/pull-tiffany-quote.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} in .env.local`);
  }
  return value;
}

async function main() {
  process.env.IMAP_HOST =
    process.env.IMAP_HOST?.trim() || "imap.secureserver.net";
  process.env.IMAP_PORT = process.env.IMAP_PORT?.trim() || "993";

  // Fail fast if secrets are missing — do not embed passwords in source.
  requireEnv("EMAIL_COMPANY_ADDRESS");
  requireEnv("EMAIL_COMPANY_IMAP_PASSWORD");
  requireEnv("EMAIL_JOSH_ADDRESS");
  requireEnv("EMAIL_JOSH_IMAP_PASSWORD");
  requireEnv("EMAIL_MICHELLE_ADDRESS");
  requireEnv("EMAIL_MICHELLE_IMAP_PASSWORD");

  const { syncAllEmailInboxes } = await import("../lib/imap-sync");
  const { listEmails } = await import("../lib/storage");
  const {
    draftTicketFromWebQuoteEmail,
    formatTicketDraftForMike,
    isPrHostingWebQuoteEmail,
  } = await import("../lib/sales-web-quote");

  const report = await syncAllEmailInboxes();
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        added: report.addedTotal,
        results: report.results.map((r) => ({
          id: r.accountId,
          ok: r.ok,
          fetched: r.fetched,
          added: r.added,
          error: r.error,
        })),
      },
      null,
      2,
    ),
  );

  const emails = await listEmails("company");
  const keys = ["tiffany", "obene", "prhost", "hosting.net", "do not", "donot"];
  const hits = emails.filter((e) => {
    const blob = [e.subject, e.sender, e.senderEmail, e.preview, e.body]
      .join("\n")
      .toLowerCase();
    return keys.some((k) => blob.includes(k));
  });

  console.log("company_emails", emails.length, "hits", hits.length);
  for (const e of hits.slice(0, 5)) {
    console.log("---HIT---");
    console.log("subject:", e.subject);
    console.log("from:", e.sender, e.senderEmail);
    console.log("at:", e.receivedAt);
    console.log("body:\n", (e.body || "").slice(0, 4000));
    if (
      isPrHostingWebQuoteEmail({
        subject: e.subject,
        sender: e.sender,
        senderEmail: e.senderEmail,
        body: e.body,
      }) ||
      /tiffany|obene/i.test(`${e.subject} ${e.body}`)
    ) {
      const draft = draftTicketFromWebQuoteEmail({
        subject: e.subject,
        sender: e.sender,
        senderEmail: e.senderEmail,
        body: e.body,
      });
      if (!draft.customerName) draft.customerName = "Tiffany Obene";
      console.log("\n" + formatTicketDraftForMike(draft));
    }
  }

  console.log(
    "\nLATEST10:\n" +
      emails
        .slice()
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
        .slice(0, 10)
        .map((e) => `${e.receivedAt} | ${e.senderEmail} | ${e.subject}`)
        .join("\n"),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
