# Party Perfect Command Center

Operations dashboard for **Party Perfect Event Rentals — Tulsa, Oklahoma**.

White + teal branding · Grok agents · Emails · Social · Inventory · Twilio SMS · Reports

## Features

| Area | What’s included |
|---|---|
| **Mike – Operations Manager** | Live inbox/social watch, Catch Up, weekly recap SMS to `MANAGER_PHONE` via Twilio |
| **Madison – Social & Client Communications** | Warm FB/IG drafts, Michelle + General email voice, Ask Madison |
| **Tabs** | Dashboard, Agents, Tasks, Emails, Social, Inventory, Bookkeeping, Marketing, Reports |
| **Live Mode** | Auto-refresh ~75s on Emails / Social / Tasks; toast notifications |
| **Inbox** | 3 mailboxes (General, Josh, Michelle), time filters, mark as replied |
| **Social** | FB/IG comments & DMs, Grok reply drafts, reply tracking |
| **Marketing** | Campaign list + Google Ads placeholder |
| **Reports** | Saved weekly recaps (SMS + generate) |

## Local development

```bash
npm install
cp .env.example .env.local
# Add at least: XAI_API_KEY, and for SMS: TWILIO_* + MANAGER_PHONE
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel (recommended)

1. Push this repo to GitHub.
2. Import the project at [vercel.com/new](https://vercel.com/new).
3. Framework Preset: **Next.js** (auto-detected).
4. Add **Environment Variables** (Production + Preview):

| Variable | Required | Notes |
|---|---|---|
| `XAI_API_KEY` | Yes | Grok agents, drafts, recaps |
| `TWILIO_ACCOUNT_SID` | For SMS | Twilio Console |
| `TWILIO_AUTH_TOKEN` | For SMS | Full Auth Token (~32 chars) |
| `TWILIO_PHONE_NUMBER` | For SMS | E.164, e.g. `+19183016535` |
| `MANAGER_PHONE` | Recommended | Default `+19188084311` |
| `EMAIL_*` / `META_*` | Optional | Live email / Meta later |

5. Deploy. Open the Vercel URL and confirm:
   - Dashboard loads with Party Perfect logo
   - Agents → Mike → **Send Test SMS** / **Generate & Send Weekly Recap**
   - Agents → Madison chat
   - Live Mode On in the header

### Vercel notes

- `vercel.json` sets API `maxDuration` to **60s** (needs Pro for >10s Grok/SMS on Hobby).
- Writable JSON data uses `/tmp` on Vercel (ephemeral). Demo seed reloads on cold starts. For durable production data, connect a database later (`DATA_DIR` / external store).
- Do **not** commit `.env.local`. Use Vercel Project → Settings → Environment Variables.
- After adding a custom domain, set `META_OAUTH_REDIRECT_URI` to `https://YOUR_DOMAIN/api/auth/meta/callback`.

## VPS / Docker (optional)

When not on Vercel, `next.config` builds `output: "standalone"`. See `scripts/deploy-vps.sh` and `ecosystem.config.cjs`.

```bash
npm run build
node .next/standalone/server.js
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local development |
| `npm run build` | Production build |
| `npm run start` | Run production build locally |
| `node scripts/send-weekly-recap.mjs test` | CLI Twilio smoke test |

## Brand

- Colors: white + teal (`#00BFA5`)
- Logo: `/public/party-perfect-logo.png` (sidebar)
- Company: Party Perfect Event Rentals · Tulsa
