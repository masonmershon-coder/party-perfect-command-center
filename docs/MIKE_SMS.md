# Mike SMS (Josh + owners)

Mike texts owners/managers and they text him back. Best channel for Josh.

## Who gets texts / can reply

| Person | Number |
|--------|--------|
| Josh | `+1 (918) 808-4311` (`MANAGER_PHONE`) |
| Owner (you) | `+1 (918) 289-5588` (built-in) |

Add more via Vercel `MANAGER_PHONES=+1...,+1...` (comma-separated).

## What Mike already does in code

- Weekly recap SMS → **all** manager phones  
- Top-tier applicant alerts → **all** manager phones  
- High-priority inbox alerts → **all** manager phones  
- Reply SMS to **+1 (866) 545-6364** with: `status` · `hiring` · `recap` · `create task: …` · free-form · `START` / `HELP` / `STOP`

Webhook (Twilio number → Messaging):  
`https://partyperfect.app/api/sms/inbound`

## Why texts are not arriving today

Twilio accepted API sends, but carriers block until compliance is approved:

| Check | Status |
|-------|--------|
| Toll-free verification (866) | **REJECTED** |
| A2P 10DLC campaign | **FAILED** (error **30909** — opt-in / CTA unverifiable) |
| `smsReady` | **false** |

Root cause (historical): compliance paperwork pointed at a host without HTTPS. Live legal pages now:

- https://partyperfect.app/legal/sms-opt-in  
- https://partyperfect.app/legal/privacy  
- https://partyperfect.app/legal/terms  

## Restart path (pick one — either unlocks delivery)

### Option A — Resubmit existing 866 (fastest if Twilio allows edit)

1. Twilio Console → Messaging → **Toll-Free Verification** for +18665456364  
2. Update Privacy / Terms / Opt-in URLs to the **comand** links above  
3. Message flow must say: owners only, verbal opt-in + text START, frequency varies, rates may apply, STOP/HELP  
4. Resubmit  

Also: Messaging → Regulatory Compliance → **A2P Campaign** → Retry with same live URLs (fixes 30909).

Or from a machine with prod Twilio env:

```bash
node --env-file=.env.local scripts/twilio-resubmit-compliance.mjs
```

### Option B — Start over (local Tulsa number)

1. Buy a **local 918** number in Twilio  
2. Register **Brand** (Party Perfect Event Rentals) + **Campaign** (Low Volume Mixed / Account Notifications)  
3. Use the **comand** legal URLs in Message Flow  
4. Attach number to Messaging Service  
5. Set Vercel: `TWILIO_PHONE_NUMBER=+1918…` and `TWILIO_MESSAGING_SERVICE_SID=MG…`  
6. Point number webhook to `/api/sms/inbound`

## After approval

1. From either phone, text Mike **START** then **status**  
2. Command Center → Agents/Reports → **Send test SMS** / weekly recap  
3. Health `?probe=1` should show `smsReady: true`

Until `smsReady` is true, do not expect recaps or hiring alerts to land.
