# Showroom sales & checkout (Party Perfect)

Source of truth for how customers are checked out. Mike uses this to coach showroom / train sales. **POR remains system of record** — Mike is read-only unless owners later authorize writes.

Showroom: Lauren, Cayden, Divine, Shelly.

## Pipeline (as run on the floor)

```
Lead in (walk-in / phone / email)
  → Showroom girl greets / gathers needs
  → Handwritten RENTAL PROPOSAL ticket (clipboard)
      (catalog lookup on phone/site as needed — eventrental.com / Party Perfect catalog)
  → Enter into Point of Rental as Quote / reservation
  → Print / send formal POR quote (Status: Quote, e.g. q#####)
  → Follow up; at ~14 days out → collect full deposit
  → Confirmed contract / reserved inventory for the event
```

## Step detail

### 1. Introduce the customer
- Walk-ins: greet at the **front door**.
- Phone / email leads: same info capture — showroom owns the ticket.
- Goal: event date/time, name, phone, email, venue, guest count, pickup vs delivery, theme/colors, what they need (linen, plates, cups, furniture, tents, dance floor, etc.).

### 2. Physical ticket (RENTAL PROPOSAL)
Hand form on clipboard before or while building the digital quote. Typical fields:
- Event date + start time
- Customer billing name / address / phone / email
- Notes (ceremony/reception layout, outdoor vs indoor)
- Delivery vs **customer pick-up and return**
- Venue / delivery address, guest count, theme + colors
- Line grid: QTY · SIZE · COLOR · DESCRIPTION (look up SKUs/prices from catalog)

Office-use dates (delivery/pickup windows) filled as the job firms up.

### 3. Point of Rental
- Enter the ticket into POR as a **Quote** (reservation path).
- Sales rep / operator on the quote (e.g. Cayden).
- Print or email the formal quote (`Status: Quote`, quote # like `q24547`).
- Quote shows items, discounts, delivery/pickup windows, special instructions, service lines.

### 4. Deposit / close
- **Full deposit when the event is ~14 days out** (owner rule — confirm edge cases with Michelle/Josh).
- Until deposit/confirm, treat as quote pipeline — do not assume inventory is locked like a paid contract.
- After deposit: job is solid for ops (warehouse, delivery crews, returns).

## Services & fee lines Mike should recognize
Common on quotes (examples from live tickets — not exhaustive):
- **Tulsa Delivery & Pick Up Convenience Service** (delivery terms / minimums / restack / weather protection notes)
- **Room flip** / venue labor (e.g. Vinterra Room Flip) when customer requests
- **Linen bag** (return linen; fee if bag not returned)
- **Dance floor** (size/style; room-flip details often needed)
- **China / chargers / flatware / glassware / linen / furniture / tents / deco**
- Care notes on flatware (rinse, do not wash/soak) — train girls to say this out loud

## What good quotes always include
- Beg/end event times
- Delivery window + venue contact
- Pickup window + who to call
- Guest count / job type (wedding, dinner party, etc.)
- Special instructions in **bold** when ops-critical (dance floor flip, same-night pickup fees, earlier-the-better)

## Training focus for sales girls (Mike coaching mode)
1. Capture **date + venue + guest count + pickup vs delivery** before deep SKU browsing.
2. Paper ticket first when in person — don’t skip fields.
3. Match catalog color/SKU to POR item names (e.g. Marie Fern charger).
4. Add required **service lines** (delivery, room flip, linen bag) — not just product SKUs.
5. Write ops notes customers care about (rinse flatware, same-night pickup fees).
6. Track quote sent date; chase toward **full deposit by ~14 days out**.
7. Never invent availability or rates — check POR / live snapshot.

## Ordering rules (packs / racks / minimum)

- **Plates, chargers, silverware, napkins:** packs of **10** — always round guest count UP to next 10.
- **Glassware:** by **rack** (often 16 or 25 — read POR item). Round UP to full racks.
- **Minimum in rentals:** rental merchandise subtotal must meet shop minimum — **not** the grand total. Fees/delivery/labor/tax do not count.

## PR web quotes (do-not-reply / prhosting.net)

Open the web quote link → **import into POR** as Quote → apply pack/rack rounding → check rental minimum → complete ticket in Command Center / send quote. Do not reply to the do-not-reply address.

## Ticket completion (Mike)
Mike can interview for every field and output a filled **Rental proposal ticket** (see `lib/sales-ticket.ts`) for showroom to enter into POR.

Required: event date/time, customer name/phone/email, pickup vs delivery, venue, guest count, ≥1 product line.  
Also collect: theme/colors, service lines (delivery / room flip / linen bag), delivery & pickup windows, ops notes.  
Deposit rule: **full deposit ~14 days out**.

## POR sync (sales block)
ENTERPRISE `Sync-PorSnapshot.ps1` pushes optional `sales`:
- `openQuotes` / `openReservations` / `quotesEventWithin14Days` (from `ContractFile` when present)
- `serviceItems` + `catalogItems` (ItemFile rates + availability for ticket lines)

Copy updated script to `C:\PartyPerfect\por-sync-agent\` and run one sync (or wait for the 10‑min task).
