# Madison · Meta (Facebook / Instagram)

Live Command Center: **https://partyperfect.app**

## Two Meta apps (do not confuse)

| App | Purpose | Connect to |
|-----|---------|------------|
| **Party Perfect Command Center** (App ID `1361332749505336`) | **Hiring / Careers only** — built Aug 2026 for Madison + AI hiring bots on the Careers Page campaign | **Party Perfect Careers** Facebook Page → [partyperfectjobs.com](https://partyperfectjobs.com) |
| **Brand / company (not created yet)** | Main Party Perfect Facebook + Instagram for events, showroom, client DMs | Main brand Page + `@partyperfecteventrental` IG |

This first app is **not** the company marketing Meta API. When Madison is “live” on this credentials set, she is on **hiring Careers traffic only**. A **second** Meta Developer app + Connect Meta flow is required later for brand FB/IG.

See [HIRING_FACEBOOK_CAREERS_PAGE.md](./HIRING_FACEBOOK_CAREERS_PAGE.md).

## OAuth redirect (required in Meta Developer Console)

Add this Valid OAuth Redirect URI:

```
https://partyperfect.app/api/auth/meta/callback
```

Keep the old typo-domain URI until you’ve reconnected once:

```
https://partyperfectcomand.app/api/auth/meta/callback
```

## Vercel / Social form

- `META_OAUTH_REDIRECT_URI=https://partyperfect.app/api/auth/meta/callback` (set)
- `META_APP_ID` / `META_APP_SECRET` (or save via Social form → Redis) — currently the **hiring** app
- Page token after OAuth must be the **Careers** Page, not the main brand Page

## After Meta console update

1. Redeploy Command Center if needed (credentials in Redis don’t require redeploy)
2. Social → **Connect with Facebook**
3. Authorize **Party Perfect Careers** only (hiring)
4. Confirm health shows `metaConfigured: true` / `madisonLive: true` for Careers
5. Later: create a second Developer app for brand FB/IG and wire multi-connection (or replace carefully)
