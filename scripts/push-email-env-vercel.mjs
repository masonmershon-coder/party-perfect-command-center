import { config } from "dotenv";
import { spawnSync } from "child_process";

config({ path: ".env.local", quiet: true });

const keys = [
  "IMAP_HOST",
  "IMAP_PORT",
  "EMAIL_COMPANY_ADDRESS",
  "EMAIL_COMPANY_IMAP_PASSWORD",
  "EMAIL_JOSH_ADDRESS",
  "EMAIL_JOSH_IMAP_PASSWORD",
  "EMAIL_MICHELLE_ADDRESS",
  "EMAIL_MICHELLE_IMAP_PASSWORD",
];

for (const key of keys) {
  const value = process.env[key];
  if (!value) {
    console.log(`skip ${key} (missing)`);
    continue;
  }
  const result = spawnSync(
    "npx",
    ["vercel", "env", "add", key, "production", "--force", "--yes"],
    {
      input: value,
      encoding: "utf8",
      cwd: process.cwd(),
    },
  );
  if (result.status === 0) {
    console.log(`set ${key}`);
  } else {
    console.log(
      `fail ${key}: ${(result.stderr || result.stdout || "").slice(0, 200)}`,
    );
  }
}
