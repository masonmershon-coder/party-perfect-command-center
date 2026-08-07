#!/usr/bin/env node
/**
 * Point Mike Twilio SMS webhook (+ messaging service) at partyperfect.app.
 *
 * Run on a machine with real Twilio env (not redacted):
 *   node --env-file=.env.local scripts/point-twilio-webhook.mjs
 */
import { Buffer } from "node:buffer";

const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
const phoneRaw = process.env.TWILIO_PHONE_NUMBER?.trim() || "";
const messagingServiceSid =
  process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || "";
const base =
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
  process.env.APP_URL?.trim().replace(/\/$/, "") ||
  "https://partyperfect.app";

if (
  !accountSid ||
  !authToken ||
  accountSid.includes("SENSITIVE") ||
  authToken.includes("SENSITIVE")
) {
  console.error(
    "Need real TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN (env looks redacted).",
  );
  process.exit(1);
}

const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
const smsUrl = `${base}/api/sms/inbound`;

async function twilioApi(method, url, body) {
  const init = {
    method,
    headers: { Authorization: `Basic ${auth}` },
  };
  if (body) {
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = body;
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function digits(s) {
  return String(s || "").replace(/\D/g, "");
}

const list = await twilioApi(
  "GET",
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=50`,
);
const numbers = list.data.incoming_phone_numbers || [];
if (!numbers.length) {
  console.error("No incoming Twilio numbers on this account.");
  process.exit(1);
}

const want = digits(phoneRaw);
const match =
  numbers.find((n) => want && digits(n.phone_number) === want) ||
  numbers.find((n) => digits(n.phone_number).endsWith("8665456364")) ||
  numbers[0];

const params = new URLSearchParams({
  SmsUrl: smsUrl,
  SmsMethod: "POST",
});
const updated = await twilioApi(
  "POST",
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${match.sid}.json`,
  params,
);

console.log("Base:", base);
console.log("Number:", match.phone_number);
console.log("Before:", match.sms_url);
console.log("After:", updated.data.sms_url || updated.data.message || updated.status);
console.log("HTTP:", updated.status);

if (messagingServiceSid && !messagingServiceSid.includes("SENSITIVE")) {
  const ms = await twilioApi(
    "POST",
    `https://messaging.twilio.com/v1/Services/${messagingServiceSid}`,
    new URLSearchParams({
      InboundRequestUrl: smsUrl,
      InboundRequestMethod: "POST",
    }),
  );
  console.log("Messaging Service HTTP:", ms.status);
  console.log(
    "Messaging inbound:",
    ms.data.inbound_request_url || ms.data.message || "(ok)",
  );
}

if (updated.status >= 400) process.exit(1);
console.log("Twilio webhook now points at", smsUrl);
