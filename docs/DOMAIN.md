# Domain: partyperfect.app

**Primary Command Center:** https://partyperfect.app

## Domains

| Domain | Role |
| --- | --- |
| `partyperfect.app` (+ www) | **Primary** — use this everywhere |
| `partyperfectcomand.app` | Legacy typo — browser redirects to primary; `/api` still works |
| `partyperfectcommand.app` | Legacy long name — same as above |
| `partyperfectjobs.com` | Public jobs site (unchanged) |

Turn **auto-renew off** on the two legacy command domains in Vercel → Domains (keep renewing `partyperfect.app` + jobs).

## Cutover checklist

- [x] Buy / attach `partyperfect.app` on the Command Center project
- [x] Code default + middleware redirect legacy hosts → `partyperfect.app`
- [x] Keep `/api/*` on legacy hosts (Twilio, POR, OAuth callbacks)
- [ ] Vercel env: `NEXT_PUBLIC_APP_URL` + `APP_URL` = `https://partyperfect.app`
- [ ] Meta Valid OAuth Redirect URI add: `https://partyperfect.app/api/auth/meta/callback` (then flip `META_OAUTH_REDIRECT_URI`)
- [ ] Google Ads redirect URI (if used) → new host
- [ ] Twilio SMS webhook → `https://partyperfect.app/api/sms/inbound` (optional; old URL still works)
- [ ] ENTERPRISE POR `config.json` → `CommandCenterUrl`: `https://partyperfect.app`
- [ ] Disable auto-renew on `partyperfectcomand.app` + `partyperfectcommand.app`

Until external services are updated, nothing should break: pages redirect, APIs remain on old hosts.
