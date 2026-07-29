import { config } from "dotenv";
import { spawnSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

config({ path: ".env.local", quiet: true });

/**
 * Push Meta + cron secrets to Vercel Production so Madison stays live
 * across serverless cold starts (/tmp credentials are ephemeral).
 *
 * Sources (env wins, then data/meta-credentials.json):
 *   META_APP_ID, META_APP_SECRET, META_PAGE_ACCESS_TOKEN, META_PAGE_ID,
 *   INSTAGRAM_BUSINESS_ACCOUNT_ID, META_OAUTH_REDIRECT_URI, CRON_SECRET
 */

function readStoredMeta() {
  const candidates = [
    join(process.cwd(), "data", "meta-credentials.json"),
    join("/tmp", "party-perfect-command-center", "meta-credentials.json"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      // ignore
    }
  }
  return null;
}

const stored = readStoredMeta();

const values = {
  META_APP_ID: process.env.META_APP_ID?.trim() || stored?.appId || "",
  META_APP_SECRET: process.env.META_APP_SECRET?.trim() || stored?.appSecret || "",
  META_PAGE_ACCESS_TOKEN:
    process.env.META_PAGE_ACCESS_TOKEN?.trim() || stored?.pageAccessToken || "",
  META_PAGE_ID: process.env.META_PAGE_ID?.trim() || stored?.pageId || "",
  INSTAGRAM_BUSINESS_ACCOUNT_ID:
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim() ||
    stored?.instagramBusinessAccountId ||
    "",
  META_OAUTH_REDIRECT_URI:
    process.env.META_OAUTH_REDIRECT_URI?.trim() ||
    "https://partyperfectcomand.app/api/auth/meta/callback",
  CRON_SECRET: process.env.CRON_SECRET?.trim() || "",
};

let pushed = 0;
let skipped = 0;
let failed = 0;

for (const [key, value] of Object.entries(values)) {
  if (!value) {
    console.log(`skip ${key} (missing)`);
    skipped += 1;
    continue;
  }
  const result = spawnSync(
    "npx",
    ["vercel", "env", "add", key, "production", "--force", "--yes"],
    {
      input: value,
      encoding: "utf8",
      cwd: process.cwd(),
      env: process.env,
    },
  );
  if (result.status === 0) {
    console.log(`set ${key}`);
    pushed += 1;
  } else {
    console.log(
      `fail ${key}: ${(result.stderr || result.stdout || "").slice(0, 240)}`,
    );
    failed += 1;
  }
}

console.log(`done pushed=${pushed} skipped=${skipped} failed=${failed}`);
if (pushed === 0 && failed === 0) {
  console.log(
    "No Meta credentials found. Connect Facebook in Social first, or fill META_* in .env.local.",
  );
  process.exitCode = 1;
}
