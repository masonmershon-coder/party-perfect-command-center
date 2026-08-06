import { readDurableJson, writeDurableJson } from "@/lib/durable-json";

/**
 * Google Ads (not AdSense) credentials — NEVER store Google account passwords.
 * OAuth refresh token + developer token + customer IDs only.
 */
export interface GoogleAdsStoredCredentials {
  /** Gmail used as Google Ads login (label only). */
  accountEmail?: string;
  clientId?: string;
  clientSecret?: string;
  /** Google Ads developer token from ads.google.com → Tools → API Center */
  developerToken?: string;
  /** Customer ID digits only, e.g. 1234567890 */
  customerId?: string;
  /** MCC/login customer if using manager account */
  loginCustomerId?: string;
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  connectedAt?: string;
  monthlyBudgetUsd?: number;
  notes?: string;
  updatedAt: string;
}

const CREDENTIALS_KEY = "google-ads-credentials.json";

export async function readGoogleAdsCredentials(): Promise<GoogleAdsStoredCredentials | null> {
  return readDurableJson<GoogleAdsStoredCredentials | null>(
    CREDENTIALS_KEY,
    null,
  );
}

export async function writeGoogleAdsCredentials(
  patch: Partial<GoogleAdsStoredCredentials>,
): Promise<GoogleAdsStoredCredentials> {
  const existing = (await readGoogleAdsCredentials()) ?? {
    updatedAt: new Date().toISOString(),
  };
  // Never persist password fields if clients send them by mistake.
  const safe = { ...patch } as Record<string, unknown>;
  delete safe.password;
  delete safe.pass;
  delete safe.accountPassword;

  const next: GoogleAdsStoredCredentials = {
    ...existing,
    ...safe,
    updatedAt: new Date().toISOString(),
  };
  await writeDurableJson(CREDENTIALS_KEY, next);
  return next;
}

export async function clearGoogleAdsOAuthTokens() {
  const existing = await readGoogleAdsCredentials();
  if (!existing) return null;
  return writeGoogleAdsCredentials({
    ...existing,
    refreshToken: undefined,
    accessToken: undefined,
    accessTokenExpiresAt: undefined,
    connectedAt: undefined,
  });
}

export function publicGoogleAdsStatus(
  creds: GoogleAdsStoredCredentials | null,
) {
  const hasClientId = Boolean(
    creds?.clientId || process.env.GOOGLE_ADS_CLIENT_ID?.trim() || process.env.GOOGLE_OAUTH_CLIENT_ID?.trim(),
  );
  const hasClientSecret = Boolean(
    creds?.clientSecret ||
      process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() ||
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim(),
  );
  const hasDeveloperToken = Boolean(
    creds?.developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim(),
  );
  const hasCustomerId = Boolean(
    creds?.customerId || process.env.GOOGLE_ADS_CUSTOMER_ID?.trim(),
  );
  const hasRefresh = Boolean(
    creds?.refreshToken || process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim(),
  );

  const canConnectOAuth = hasClientId && hasClientSecret;
  const canSync =
    canConnectOAuth && hasDeveloperToken && hasCustomerId && hasRefresh;

  return {
    accountEmail:
      creds?.accountEmail ||
      process.env.GOOGLE_ADS_ACCOUNT_EMAIL?.trim() ||
      null,
    hasClientId,
    hasClientSecret,
    hasDeveloperToken,
    hasCustomerId,
    hasRefreshToken: hasRefresh,
    canConnectOAuth,
    canSync,
    monthlyBudgetUsd: creds?.monthlyBudgetUsd ?? null,
    customerId: creds?.customerId
      ? maskCustomerId(creds.customerId)
      : process.env.GOOGLE_ADS_CUSTOMER_ID
        ? maskCustomerId(process.env.GOOGLE_ADS_CUSTOMER_ID)
        : null,
    connectedAt: creds?.connectedAt ?? null,
    message: canSync
      ? "Google Ads live — Mike can review campaigns & keywords."
      : !canConnectOAuth
        ? "Add Google Cloud OAuth Client ID + Secret to start connect."
        : !hasRefresh
          ? "OAuth Client ready — click Connect with Google (login as Partyperfectok@gmail.com)."
          : !hasDeveloperToken || !hasCustomerId
            ? "OAuth connected — still need Ads Developer Token + Customer ID for live data."
            : "Finish remaining Google Ads setup fields.",
  };
}

function maskCustomerId(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••${digits.slice(-4)}`;
}

export function resolveGoogleAdsConfig(creds: GoogleAdsStoredCredentials | null) {
  return {
    clientId:
      process.env.GOOGLE_ADS_CLIENT_ID?.trim() ||
      process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ||
      creds?.clientId?.trim() ||
      "",
    clientSecret:
      process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() ||
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ||
      creds?.clientSecret?.trim() ||
      "",
    developerToken:
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() ||
      creds?.developerToken?.trim() ||
      "",
    customerId: (
      process.env.GOOGLE_ADS_CUSTOMER_ID?.trim() ||
      creds?.customerId?.trim() ||
      ""
    ).replace(/\D/g, ""),
    loginCustomerId: (
      process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim() ||
      creds?.loginCustomerId?.trim() ||
      ""
    ).replace(/\D/g, ""),
    refreshToken:
      process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim() ||
      creds?.refreshToken?.trim() ||
      "",
    accountEmail:
      process.env.GOOGLE_ADS_ACCOUNT_EMAIL?.trim() ||
      creds?.accountEmail?.trim() ||
      "",
    monthlyBudgetUsd: creds?.monthlyBudgetUsd,
  };
}
