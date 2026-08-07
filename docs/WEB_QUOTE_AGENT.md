# Recurring web-quote workflow (Mike + showroom)

Goal: every PR / do-not-reply web quote (like Tiffany Obene) becomes a finished POR ticket the same day — without waiting on a chat.

## Happy path (target: &lt; 10 minutes)

1. **IMAP sync** pulls `Rentals@partyperfecteventrental.com` into Command Center (cron or `?sync=1`).
2. Mike detects PR hosting / do-not-reply / web-quote emails.
3. Mike drafts a **Rental proposal ticket**:
   - customer, event, venue, guests, lines
   - pack-of-10 rounding (plates/chargers/silverware/napkins)
   - glassware by rack (16/25)
   - **minimum in rentals** check (not grand total)
4. Showroom opens the **web quote link** → **Import into POR** → paste/finish Mike’s lines.
5. Send formal Quote / chase full deposit ~14 days out.

## What must stay green

| Piece | Why |
|--------|-----|
| Vercel `EMAIL_COMPANY_IMAP_PASSWORD` | Without IMAP, Mike never sees Tiffany-class emails |
| Redis durable store | Inbox + hiring survive deploys |
| ENTERPRISE POR sync (10 min) | Rates / availability for ticket lines |
| Owner/showroom POR login | Mike is read-only — humans still click Import in POR |

## Agent cadence (recommended)

- **Every 15 min:** IMAP sync for Rentals only (lightweight cron).
- **On new PR/web quote:** Mike creates a Command Center task: `Web quote — {Customer} — import to POR`.
- **SMS Josh** only if score/urgency high or quote event ≤ 14 days.
- **Daily:** Mike lists open web-quote tasks still not imported.

## If IMAP fails (current blocker)

1. Confirm GoDaddy mailbox password in browser webmail.
2. Enable IMAP in GoDaddy Workspace if disabled.
3. Update Vercel env + redeploy.
4. Fallback: forward the web-quote email to Josh or paste into Mike chat — he still builds the ticket.

## Tiffany Obene (this week)

Blocked on IMAP auth to Rentals. Once mail syncs, Mike completes the ticket immediately; showroom imports in POR; screenshot Command Center + POR quote.
