# PP-TIME-001 — Preview / phone test

**Status:** Preview deployed · **NOT production** · **0009 NOT applied to Postgres**  
**Updated:** 2026-08-14

## Preview URL

https://party-perfect-time-preview.vercel.app/time

Deployment URL: `https://party-perfect-command-center-a39rrvtkb-party-perfect.vercel.app`  
Target: **preview only** (not aliased to partyperfect.app)

Role-aware Time app is live in this preview:
- Employee: My Time
- Shelly: Review / Employees / Time Off / Payroll
- Mason: + Security
- Michelle: complete owner access
- Command Center remains a mirror only

The stable `party-perfect-time-preview.vercel.app` alias can move to future preview
deployments without regenerating the QR. The original QR target contained
`…1biodfb8f…`; that is an immutable deployment URL and Vercel refused to repoint it.

## Important: Vercel Deployment Protection

This preview is currently blocked by **Vercel Authentication** (SSO). iPhone Safari will see a Vercel login wall, not Party Perfect Time.

**Mason:** In Vercel → Project `party-perfect-command-center` → Settings → Deployment Protection → for **Preview**, set protection to **None** (or Standard Protection off) for this test window. Then reload the URL above. Re-enable after testing if you want.

Do **not** promote this deployment to production.

## What this preview uses (safe)

| Item | Choice |
|---|---|
| Production Postgres `0009` | **Not applied** |
| Durable Time data | Private Vercel Blob snapshot (same durable adapter; preview only) |
| Preview flags | `TIME_PREVIEW=1`; preview-specific `TIME_SESSION_SECRET` |
| Punch location | Off-site allowed; GPS/IP/device captured as review evidence |
| Paychex / live payroll | Off |

## Mason phone checklist

1. Open `/time` on iPhone Safari (after protection is off)
2. Confirm the branded “Let’s add Time to your phone” screen appears
3. Continue through Share → Add to Home Screen → Add
4. Launch Party Perfect Time from the Home Screen
5. Confirm install instructions are gone
6. Continue to First Name + Last Name + 4-digit PIN
7. Allow Location when requested during the first punch

## QR

Local file: `public/time/preview-qr.png`.

- Encodes `https://party-perfect-time-preview.vercel.app/time`
- Generated programmatically with high error correction and quiet zone
- Decoded locally with macOS Vision to the exact URL above

## Verification

- iPhone Safari user-agent + 390×844 viewport:
  - first-open welcome shown
  - step 1 Share icon/instruction shown
  - step 2 Add to Home Screen row shown
  - step 3 Add instruction shown
  - Done reveals First/Last/PIN onboarding
- Android mobile user-agent: first-open install experience shown; native prompt path
  is wired through `beforeinstallprompt`, with guided fallback.
- Live manifest: `display=standalone`, `/time` scope/start/id, Party Perfect Time name.
- Live Apple 180px, 192px, 512px, and maskable 512px PNGs all returned `200`.
- `npx tsc --noEmit`, `npm run test:time`, and `npm run build` passed.
- Protected live API verification:
  - Shelly Time session received review + employees + payroll capabilities and loaded `/api/time/admin/employees`
  - Mason Time session loaded `/api/time/admin/security`
  - Michelle Time session loaded payroll with owner authority
  - Ordinary employee Time session received `403` from `/api/time/admin/requests`
