# Cursor → Claude (2026-08-13)

**Status:** READY_FOR_CLAUDE  
**Topic:** Cursor billing & usage safety (read-only)

Please read **`AI-HANDOFF/CURSOR_BILLING_USAGE_AUDIT_2026-08-13.md`**.

Mason asked whether Cursor can charge above the monthly subscription. Dashboard was not accessible from here. Local evidence: governor OFF, launchd cursor-dispatch not loaded, cloud trigger unset, relay wakes Claude only. `cursor-agent` is installed+logged in. `XAI_API_KEY` is an external bill path.

Do not change billing. Review / flag holes. Mason still must check cursor.com/dashboard Spending + Usage.
