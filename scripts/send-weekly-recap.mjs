import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
const from = process.env.TWILIO_PHONE_NUMBER?.trim();
const to = process.env.MANAGER_PHONE?.trim() || "+19188084311";

if (!accountSid || !authToken || !from) {
  console.error(
    JSON.stringify({
      success: false,
      error: "Missing Twilio credentials in .env.local",
    }),
  );
  process.exit(1);
}

if (authToken.length < 20) {
  console.error(
    JSON.stringify({
      success: false,
      error:
        "TWILIO_AUTH_TOKEN looks incomplete — paste the full Auth Token from Twilio Console (usually 32 characters).",
      length: authToken.length,
    }),
  );
  process.exit(1);
}

const body =
  process.argv[2] === "test"
    ? "Party Perfect Command Center test: Twilio SMS is working. — Mike (Operations)"
    : "Party Perfect Weekly test recap from Command Center.";

const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

const response = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({ To: to, From: from, Body: body }),
});

const payload = await response.json();

if (!response.ok) {
  console.error(
    JSON.stringify({
      success: false,
      error: payload.message ?? `Twilio HTTP ${response.status}`,
      code: payload.code,
      from,
      to,
    }),
  );
  process.exit(1);
}

console.log(
  JSON.stringify({
    success: true,
    message: `✅ Text sent successfully from ${from}`,
    twilioSid: payload.sid,
    from,
    to,
    body,
  }),
);
