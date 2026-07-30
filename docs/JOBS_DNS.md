# partyperfectjobs.com → Vercel (same app as Command Center)

Applications on **partyperfectjobs.com** and Hiring on **partyperfectcomand.app** share one backend. There is no manual transfer — durable Redis + backup email is the source of truth.

## 1. Link Upstash Redis (required — free tier is fine)

1. Open [Vercel Dashboard](https://vercel.com) → project **party-perfect-command-center**.
2. **Storage** → Create → **Upstash Redis** (accept marketplace terms if asked).
3. Connect the store to **Production** (and Preview if you want).
4. Confirm env vars exist:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
5. Redeploy Production.
6. Check health: `https://partyperfectcomand.app/api/health`
   - `durableStoreMode` must be `"redis"`
   - `jobsStoreOk` must be `true`
7. Migrate any old Blob apps once:

```bash
npm run store:migrate
npm run jobs:migrate
```

(Use `--env-file=.env.local` or pull env from Vercel first.)

## 2. Backup email (every application)

Add to Vercel env (GoDaddy Workspace SMTP):

```
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=465
SMTP_USER=Rentals@partyperfecteventrental.com
SMTP_PASS=<same as EMAIL_COMPANY_IMAP_PASSWORD>
SMTP_FROM=Party Perfect Hiring <Rentals@partyperfecteventrental.com>
JOB_APPLICATION_BACKUP_TO=info@mershonevents.com,Rentals@partyperfecteventrental.com
```

If `SMTP_*` is omitted, the app falls back to `EMAIL_COMPANY_ADDRESS` + `EMAIL_COMPANY_IMAP_PASSWORD` with `SMTP_HOST` still required.

Health field `jobsBackupEmailConfigured` should become `true`.

## 3. Attach the jobs domain

1. Vercel → **party-perfect-command-center** → **Domains**.
2. Add:
   - `partyperfectjobs.com`
   - `www.partyperfectjobs.com`
3. In **GoDaddy** DNS for `partyperfectjobs.com`, use the records Vercel shows (typical):
   - Apex `@` → A record to Vercel’s IP (often `76.76.21.21`), **or** the A/ALIAS Vercel lists.
   - `www` → CNAME `cname.vercel-dns.com` (or the exact target Vercel shows).
4. Wait for SSL (minutes to an hour).
5. Test:
   - Open `https://partyperfectjobs.com` → apply form loads.
   - Submit a test application.
   - Command Center → **Hiring** shows it.
   - Josh/Rentals inbox gets the backup email.

## 4. Until DNS is live

Use the same form at:

`https://partyperfectcomand.app/jobs`

Same API, same Redis, same Hiring list.

## 5. What “always up” means

| Piece | Role |
|--------|------|
| `/jobs` page | Static apply UI — independent of IMAP/Live Mode |
| `POST /api/jobs/apply` | Saves to Redis, emails backup, SMS top scores |
| Command Center Hiring | Reads the same Redis index |
| Blob / email sync failures | Must **not** take down apply |

If Redis is down, apply returns **503**, still tries backup email, and asks the applicant to retry/call — never a false “Application received” without a durable save.
