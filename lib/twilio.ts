const E164_PATTERN = /^\+[1-9]\d{6,14}$/;
const MAX_SMS_LENGTH = 1600;
const DEFAULT_MANAGER_PHONE = "+19188084311";

function digitsOnly(phone: string) {
  return phone.replace(/\D/g, "");
}

function normalizeUsPhone(phone: string) {
  const digits = digitsOnly(phone);
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  const trimmed = phone.trim();
  return trimmed.startsWith("+") ? trimmed : `+${digits}`;
}

export function getManagerPhone() {
  const phone = process.env.MANAGER_PHONE?.trim() || DEFAULT_MANAGER_PHONE;
  assertValidE164(phone, "MANAGER_PHONE");
  return phone;
}

/** Josh + any extra authorized numbers (comma-separated MANAGER_PHONES). */
export function getAuthorizedManagerPhones() {
  const primary = getManagerPhone();
  const extras = (process.env.MANAGER_PHONES ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map(normalizeUsPhone);
  const all = [primary, ...extras];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const phone of all) {
    try {
      assertValidE164(phone, "MANAGER_PHONES");
    } catch {
      continue;
    }
    const key = digitsOnly(phone).replace(/^1/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(phone);
  }
  return unique;
}

export function formatPhoneDisplay(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  messagingServiceSid: string | null;
}

export function getTwilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER?.trim();
  const messagingServiceSid =
    process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || null;

  if (!accountSid || !authToken || !phoneNumber) {
    return null;
  }

  return { accountSid, authToken, phoneNumber, messagingServiceSid };
}

export function getTwilioPublicStatus() {
  const config = getTwilioConfig();
  let managerPhone = DEFAULT_MANAGER_PHONE;
  try {
    managerPhone = getManagerPhone();
  } catch {
    // keep default for status display
  }

  return {
    configured: Boolean(config),
    fromNumber: config?.phoneNumber ?? null,
    fromDisplay: config ? formatPhoneDisplay(config.phoneNumber) : null,
    messagingServiceSidSet: Boolean(config?.messagingServiceSid),
    toNumber: managerPhone,
    toDisplay: formatPhoneDisplay(managerPhone),
    accountSidSet: Boolean(process.env.TWILIO_ACCOUNT_SID?.trim()),
    authTokenSet: Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()),
    authTokenLooksIncomplete:
      Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()) &&
      (process.env.TWILIO_AUTH_TOKEN?.trim().length ?? 0) < 20,
  };
}

export function assertTwilioConfigured(): TwilioConfig {
  const config = getTwilioConfig();
  if (!config) {
    throw new Error(
      "Twilio is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to .env.local.",
    );
  }

  if (config.authToken.length < 20) {
    throw new Error(
      "TWILIO_AUTH_TOKEN looks incomplete. Paste the full Auth Token from Twilio Console → Account Info → Auth Token → Show (usually 32 characters).",
    );
  }

  assertValidE164(config.phoneNumber, "TWILIO_PHONE_NUMBER");
  return config;
}

function assertValidE164(phone: string, label: string) {
  if (!E164_PATTERN.test(phone)) {
    throw new Error(
      `${label} must be a valid E.164 phone number (e.g. +19188084311).`,
    );
  }
}

/**
 * Sends SMS via Twilio REST API.
 * Prefers Messaging Service (A2P) when TWILIO_MESSAGING_SERVICE_SID is set.
 */
export async function sendSms(input: { to: string; body: string }) {
  const config = assertTwilioConfigured();
  const body = input.body.trim();
  const to = input.to.trim();

  if (!body) {
    throw new Error("SMS body cannot be empty.");
  }

  if (body.length > MAX_SMS_LENGTH) {
    throw new Error(`SMS body exceeds ${MAX_SMS_LENGTH} characters.`);
  }

  assertValidE164(to, "Recipient phone");

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const credentials = Buffer.from(
    `${config.accountSid}:${config.authToken}`,
  ).toString("base64");

  const params = new URLSearchParams({
    To: to,
    Body: body,
  });
  if (config.messagingServiceSid) {
    params.set("MessagingServiceSid", config.messagingServiceSid);
  } else {
    params.set("From", config.phoneNumber);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const payload = (await response.json()) as {
    sid?: string;
    status?: string;
    from?: string;
    message?: string;
    code?: number;
    more_info?: string;
  };

  if (!response.ok) {
    const detail =
      payload.message ?? `Twilio request failed (${response.status}).`;
    const code = payload.code ? ` [code ${payload.code}]` : "";
    throw new Error(`${detail}${code}`);
  }

  if (!payload.sid) {
    throw new Error("Twilio did not return a message SID.");
  }

  return {
    sid: payload.sid,
    status: payload.status ?? "queued",
    from: payload.from ?? config.phoneNumber,
    to,
  };
}
