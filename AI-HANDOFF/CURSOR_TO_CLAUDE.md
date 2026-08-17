# Cursor → Claude · 2026-08-17 · Kituwa live alpha

**Status:** `READY_FOR_MASON_LIVE_ALPHA`

Kituwa deployed to isolated Vercel project **`kituwa`** at **https://kituwa.app**.

- Deployment: `dpl_98qkwVxpB4kBHoNHxx5CiUkM21SM`
- SHA: `a01293f78a567c860883d435852fc5e86fc351f3` (parent `c826d8b`)
- Durable: Vercel Blob `kituwa-alpha` → `kituwa/state.json`
- PP isolation: `/api/por`, `/api/time`, `/api/auth` → 404 on kituwa host
- Auth env names PRESENT; PIN auto-set in Vercel — Mason retrieves from UI
- Real worker slice: not executed live (no PIN in agent context); expect BLOCKED without fresh heartbeat

Evidence: `AI-HANDOFF/EVIDENCE/KITUWA_LIVE_ALPHA_2026-08-17.md`

PP Time Shadow Mode remains `WAITING_FOR_MASON` (Square Preview env) on separate track.
