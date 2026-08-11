/**
 * Strip card ciphertext and government ID fields before store/API/AI exposure.
 * CheckCardFile is never ingested — this covers PaymentFile + CustomerFile columns.
 */

const PAYMENT_STRIP = new Set([
  "Encrypted",
  "EncryptedCard",
  "CCAlias",
  "encrypted",
  "encryptedCard",
  "ccAlias",
]);

const CUSTOMER_STRIP = new Set([
  "CreditCard",
  "SocialSecurity",
  "DriversLicense",
  "AutoLicense",
  "FederalId",
  "TaxId",
  "TaxExemptNumber",
  "InsuranceNumber",
  "OTHERID",
  "Birthdate",
  "creditCard",
  "socialSecurity",
  "driversLicense",
  "autoLicense",
  "federalId",
  "taxId",
]);

export function stripPaymentCardFields<T extends Record<string, unknown>>(
  row: T,
): Omit<T, "Encrypted" | "EncryptedCard" | "CCAlias"> {
  const out = { ...row };
  for (const key of PAYMENT_STRIP) {
    delete out[key];
  }
  return out;
}

export function stripCustomerIdFields<T extends Record<string, unknown>>(
  row: T,
): T {
  const out = { ...row };
  for (const key of CUSTOMER_STRIP) {
    delete out[key];
  }
  return out;
}

/** Public API / AI view of a customer — no ID/SSN/CC columns. */
export function toPublicCustomer<T extends Record<string, unknown>>(
  customer: T,
): T {
  return stripCustomerIdFields(customer);
}

/** Redact dollar fields when financial access is locked. */
export function redactFinancials<T>(
  value: T,
  includeFinancials: boolean,
): T {
  if (includeFinancials) return value;
  if (value == null || typeof value !== "object") return value;

  const moneyKeys = new Set([
    "totl",
    "paid",
    "rent",
    "sale",
    "tax",
    "dpmt",
    "pymt",
    "amount",
    "tendered",
    "balance",
    "paymentDetailTotal",
    "creditLimit",
    "currentBalance",
    "highBalance",
    "lastPayAmount",
    "pric",
    "taxAmount",
    "dailyAmount",
    "discount",
    "rate1",
    "sell",
  ]);

  if (Array.isArray(value)) {
    return value.map((v) => redactFinancials(v, false)) as T;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (moneyKeys.has(k)) {
      out[k] = null;
      continue;
    }
    if (v != null && typeof v === "object") {
      out[k] = redactFinancials(v, false);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}
