# Domain: partyperfect.app

**Primary Command Center:** https://partyperfect.app

## Domains

| Domain | Role |
| --- | --- |
| `partyperfect.app` (+ www) | **Primary** — use this everywhere |
| `partyperfectcomand.app` | Legacy typo — browser redirects to primary; `/api` still works |
| `partyperfectcommand.app` | Legacy long name — same as above |
| `partyperfectjobs.com` | Public jobs site (unchanged) |

## Cutover checklist

- [x] Buy / attach `partyperfect.app` on the Command Center project
- [x] Code default + middleware redirect legacy hosts → `partyperfect.app`
- [x] Keep `/api/*` on legacy hosts during transition
- [x] Vercel env: `NEXT_PUBLIC_APP_URL` + `APP_URL` = `https://partyperfect.app`
- [x] Vercel env: `META_OAUTH_REDIRECT_URI` = `https://partyperfect.app/api/auth/meta/callback`
- [x] Auto-renew off on legacy command domains; on for `partyperfect.app`
- [ ] **Meta Developer Console** — add Valid OAuth Redirect URI:  
      `https://partyperfect.app/api/auth/meta/callback`  
      (keep old URI until reconnect works)
- [ ] **Twilio Console** — Phone number (+1 866 545-6364) A MESSAGE COMES IN webhook:  
      `https://partyperfect.app/api/sms/inbound` (HTTP POST)  
      Or run: `node --env-file=.env.local scripts/point-twilio-webhook.mjs`
- [ ] **ENTERPRISE POR** `config.json` → `"CommandCenterUrl": "https://partyperfect.app"`
- [ ] Google Ads redirect URI (if used) → `https://partyperfect.app/api/auth/google-ads/callback`

## Verify

```bash
curl -sI https://partyperfectcomand.app/ | head -5   # expect 308 → partyperfect.app
curl -s https://partyperfect.app/api/health | python3 -m json.tool
curl -sI https://partyperfect.app/legal/sms-opt-in | head -5
```
