#!/usr/bin/env node
/**
 * Resubmit failed A2P campaign + try enrich TF verification.
 * Usage: node --env-file=.env.local scripts/twilio-resubmit-compliance.mjs
 */
import { Buffer } from "node:buffer";

const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
if (!accountSid || !authToken) {
  console.error("Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN");
  process.exit(1);
}

const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

async function twilioJson(method, url, body) {
  const init = {
    method,
    headers: { Authorization: `Basic ${auth}` },
  };
  if (body) {
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = body;
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 1500) };
  }
  return { status: res.status, data };
}

const MESSAGE_FLOW = [
  "End users are Party Perfect Event Rentals owners and authorized managers only.",
  "They opt in by (1) verbally providing their mobile number during Command Center setup",
  "for Mike operational SMS after being told they will receive recurring business texts,",
  "and/or (2) texting START to the Mike Twilio number.",
  "Public opt-in documentation: https://partyperfectcomand.app/legal/sms-opt-in",
  "(screenshot evidence: https://partyperfectcomand.app/legal/sms-opt-in.png).",
  "Message frequency varies. Message and data rates may apply.",
  "Reply STOP to cancel. Reply HELP for help.",
  "Privacy Policy: https://partyperfectcomand.app/legal/privacy",
  "(states mobile numbers are not shared with third parties for marketing).",
  "Terms: https://partyperfectcomand.app/legal/terms.",
].join(" ");

const DESCRIPTION =
  "Internal operational SMS from Mike for Party Perfect Event Rentals owners/managers: task updates, hiring alerts, weekly recaps, and inbox priorities.";

const SAMPLES = [
  "Party Perfect Mike: Weekly recap — 3 open tasks, 2 hiring candidates scored 70+. Reply HELP for help, STOP to cancel.",
  "Party Perfect Mike: Top candidate alert — Jordan scored 82 for Event Setup. Review in Hiring. Reply STOP to opt out.",
];

const MS_LC = "MG74887542ec9a90cb15616b46571913cd";
const QE = "QE2c6890da8086d771620e9b13fadeba0b";
const HH = "HH7b3fc2739ae07623793171028590a06c";

const a2pParams = new URLSearchParams();
a2pParams.set("MessageFlow", MESSAGE_FLOW);
a2pParams.set("Description", DESCRIPTION);
for (const sample of SAMPLES) a2pParams.append("MessageSamples", sample);
a2pParams.set("HasEmbeddedLinks", "true");
a2pParams.set("HasEmbeddedPhone", "true");
a2pParams.set("AgeGated", "false");
a2pParams.set("DirectLending", "false");
a2pParams.set("PrivacyPolicyUrl", "https://partyperfectcomand.app/legal/privacy");
a2pParams.set(
  "TermsAndConditionsUrl",
  "https://partyperfectcomand.app/legal/terms",
);

const a2p = await twilioJson(
  "POST",
  `https://messaging.twilio.com/v1/Services/${MS_LC}/Compliance/Usa2p/${QE}`,
  a2pParams,
);
console.log("=== A2P RESUBMIT ===");
console.log("http", a2p.status);
console.log("campaign_status", a2p.data.campaign_status || a2p.data.status);
if (a2p.data.errors) console.log("errors", JSON.stringify(a2p.data.errors));
if (a2p.data.message) console.log("message", a2p.data.code, a2p.data.message);

const sample =
  "Party Perfect Mike: Hiring alert — top candidate scored 82 for Event Setup. Review in Command Center Hiring. Msg frequency varies. Reply HELP for help, STOP to cancel.";

const tfParams = new URLSearchParams({
  ProductionMessageSample: sample,
  PrivacyPolicyUrl: "https://partyperfectcomand.app/legal/privacy",
  TermsAndConditionsUrl: "https://partyperfectcomand.app/legal/terms",
  OptInImageUrls: "https://partyperfectcomand.app/legal/sms-opt-in.png",
  AdditionalInformation:
    "Recipients are Party Perfect owners and authorized managers who provide mobile numbers for internal operational SMS. Opt-in docs: https://partyperfectcomand.app/legal/sms-opt-in Privacy: https://partyperfectcomand.app/legal/privacy Terms: https://partyperfectcomand.app/legal/terms",
  EditReason:
    "Add production message sample and explicit privacy/terms URLs for reviewer clarity",
});

const tf = await twilioJson(
  "POST",
  `https://messaging.twilio.com/v1/Tollfree/Verifications/${HH}`,
  tfParams,
);
console.log("\n=== TF UPDATE ===");
console.log("http", tf.status);
console.log("status", tf.data.status);
console.log("edit_allowed", tf.data.edit_allowed);
if (tf.data.message) console.log("message", tf.data.code, tf.data.message);

const tfNow = await twilioJson(
  "GET",
  `https://messaging.twilio.com/v1/Tollfree/Verifications/${HH}`,
);
const a2pNow = await twilioJson(
  "GET",
  `https://messaging.twilio.com/v1/Services/${MS_LC}/Compliance/Usa2p/${QE}`,
);
console.log("\n=== CURRENT ===");
console.log("TF", tfNow.data.status, tfNow.data.date_updated);
console.log("A2P", a2pNow.data.campaign_status, a2pNow.data.date_updated);
if (a2pNow.data.errors) {
  console.log("A2P errors", JSON.stringify(a2pNow.data.errors));
}
