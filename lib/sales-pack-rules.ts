/**
 * Ordering / packing rules for showroom quotes (Party Perfect).
 * Mike uses these when completing tickets from email or walk-ins.
 */
export const SALES_PACK_AND_MINIMUM_RULES = `
ORDERING RULES (Party Perfect — enforce on every quote/ticket):

PACKS OF 10 (always round guest need UP to next pack of 10):
- Plates (all styles)
- Chargers
- Silverware / flatware (each piece type counted separately — forks, knives, spoons, etc.)
- Napkins

Example: 125 guests → order 130 of each plate/charger/napkin/flatware piece (13 packs of 10), not 125.

GLASSWARE:
- Sold by the rack, not packs of 10.
- Rack size varies by SKU — often rack of 16 or rack of 25 (read the POR item name / notes).
- Round guest need UP to full racks of that SKU's rack size.
- Example: 125 guests + rack of 25 → 5 racks (125); rack of 16 → 8 racks (128).

MINIMUM IN RENTALS (not grand total):
- POR / shop rule: meet the **minimum in rentals** (rental merchandise subtotal), NOT the invoice grand total.
- Delivery fees, room flip, labor, damage waiver, tax, and similar service lines do NOT count toward the rental minimum.
- When building a quote, check that product rental lines clear the shop minimum before calling the ticket ready.
- If under minimum, tell showroom what $ or which add-ons (more linen, glassware, décor) would clear it — do not invent the dollar minimum if unknown; ask Josh/Michelle or check current shop policy.

PR / WEB HOSTING QUOTES (emails from do-not-reply / *.prhosting.net / Point of Rental web):
- These are web-submitted tickets (e.g. customer Tiffany).
- Do NOT reply to the do-not-reply address.
- Workflow: open the web quote link from the email → import into POR as Quote → complete missing fields on the ticket → apply pack/rack rounding → verify rental minimum → send formal quote / chase deposit.
- In Command Center: parse the email body into a Rental proposal ticket (customer, event, lines) so showroom can follow through easily.
`.trim();
