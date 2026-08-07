import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { syncAllEmailInboxes } from "../lib/imap-sync";

async function main() {
  const report = await syncAllEmailInboxes();
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        addedTotal: report.addedTotal,
        highPriority: report.highPriorityNew.length,
        results: report.results.map((r) => ({
          id: r.accountId,
          ok: r.ok,
          fetched: r.fetched,
          added: r.added,
          error: r.error ? r.error.slice(0, 160) : undefined,
        })),
        sampleSubjects: report.highPriorityNew.slice(0, 5).map((e) => ({
          accountId: e.accountId,
          subject: e.subject.slice(0, 80),
          priority: e.priority,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
