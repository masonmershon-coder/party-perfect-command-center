# Google Ads + Mike (Party Perfect)

## Important

This is **Google Ads** (paid search), not AdSense.  
**Never store the Gmail password** in Command Center — Google OAuth only.

Login label (already supported in UI): `Partyperfectok@gmail.com`

## What’s in Command Center

- **Marketing / Ads** → save Client ID/Secret, Developer Token, Customer ID, monthly budget  
- **Connect with Google** → OAuth as Partyperfectok  
- **Sync** → campaigns + keywords (last 30 days) for Mike  
- Mike chat loads live snapshot + Tulsa keyword/budget playbook  

## Connect checklist

1. [Google Cloud Console](https://console.cloud.google.com/) → create project → **APIs & Services** → enable **Google Ads API**.
2. Create **OAuth client (Web application)**.
3. Add authorized redirect URI (exact):
   ```
   https://partyperfect.app/api/auth/google-ads/callback
   ```
4. Copy **Client ID** + **Client Secret** into Command Center Marketing → Save.
5. [Google Ads](https://ads.google.com/) → sign in as `Partyperfectok@gmail.com`  
   - Note **Customer ID** (top right, xxx-xxx-xxxx)  
   - **Tools → API Center** → apply / copy **Developer token** (approval can take time)
6. Paste Customer ID + Developer Token + monthly budget → Save.
7. **Connect with Google** → allow AdWords scope.
8. **Sync campaigns & keywords**.

Success: Marketing shows **Google Ads · Live for Mike**; health `googleAdsConfigured: true`.

## Env alternatives (Vercel)

Optional instead of form:
- `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET` (or reuse `GOOGLE_OAUTH_*`)
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_CUSTOMER_ID`
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (MCC only)
- `GOOGLE_ADS_REFRESH_TOKEN` (usually from OAuth)
- `GOOGLE_ADS_ACCOUNT_EMAIL=Partyperfectok@gmail.com`
- `GOOGLE_ADS_OAUTH_REDIRECT_URI=https://partyperfect.app/api/auth/google-ads/callback`

## Mike’s job

- Wasteful keywords  
- Geo keep Tulsa metro  
- Budget vs spend  
- Suggest 3–5 keywords that win rentals quotes  
Playbook: `lib/mike-google-ads-playbook.ts`
