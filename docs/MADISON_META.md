# Madison · Meta (Facebook / Instagram)

Live Command Center: **https://partyperfect.app**

## OAuth redirect (required in Meta Developer Console)

Add this Valid OAuth Redirect URI:

```
https://partyperfect.app/api/auth/meta/callback
```

Keep the old typo-domain URI until you’ve reconnected once:

```
https://partyperfectcomand.app/api/auth/meta/callback
```

## Vercel env

- `META_OAUTH_REDIRECT_URI=https://partyperfect.app/api/auth/meta/callback` (set)
- `META_APP_ID` / `META_APP_SECRET` (or save via Social form → Redis)
- Page token / IG business account after OAuth

## After Meta console update

1. Redeploy Command Center (or wait for next deploy)
2. Owner → Social → Connect Meta
3. Confirm health shows `metaConfigured: true` / `madisonLive: true`
