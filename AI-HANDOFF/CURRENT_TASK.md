# CURRENT TASK

**TASK ID:** MATTER-PRESENCE-001
**STATUS:** `READY_FOR_CLAUDE_REVIEW`
**UPDATED:** 2026-10-27

Living presence kit `ios/MatterKit` on `cursor/matter-living-presence-119d`. The Wick, family seats, home/work split, and title-only shelf are SwiftUI components for Claude's app. No second app, no NAS, no account backend. Handoff: `ios/MatterKit/INTEGRATION.md`. Xcode is not on this machine. PR #22 stays open.

**TASK ID:** MATTER-PHONE-IOS-001
**STATUS:** `READY_FOR_CLAUDE_REVIEW`
**UPDATED:** 2026-10-27

Phone gateway contract version 3 on `cursor/matter-ios-phone-slice-119d` (PR #22, open, do not merge). This gateway does not classify tasks and does not record approvals. It forwards to `MATTER_INTAKE_URL` / `MATTER_APPROVAL_URL` or returns 503. Claude's unpublished `83e9c21` and `e041ad5` were not in this clone. Comparison: `AI-HANDOFF/matter/MOBILE_INTEGRATION_COMPARISON.md`. Not installed on an iPhone. Do not deploy kituwa.app.

**TASK ID:** KITUWA-TOWER-V3  
**STATUS:** `CURSOR_WORKING`  
**UPDATED:** 2026-08-19  

Visual/product repair of Matter Tower on kituwa.app. Backend/API/auth untouched. Presentation layer rebuilt: scavenged Matter entity, night-building windows, distinct department dioramas, floor takeover, ambient CSS life tied to real occupancy.

**Not in production yet.** Live kituwa.app is still SHA `60b8528` until Mason says promote.
