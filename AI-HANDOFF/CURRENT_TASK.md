# CURRENT TASK

**TASK ID:** PP-SEC-001  
**STATUS:** BLOCKED (awaiting Codex CLI) — deploy is LIVE  
**UPDATED:** 2026-08-12  
**OWNER:** cursor · **VERIFIER:** codex  

## Deployed (done)
- **Commit SHA:** `ddfadc10208ce56bdd926d63c1a695de85959d59`
- **Branch:** `deploy/pp-sec-001` (from `main`; no POR/feature dirty tree)
- **Production:** https://partyperfect.app → deployment `c3vw22vgq` (+ promote `2XdoEQgv11RHwyjFFTQwLJbDcvpr`)

## Cursor smoke (not certification)
Unauth private GETs → **401** + `Cache-Control: private, no-store, max-age=0, must-revalidate`.

## Certification gate
Control plane handed to Codex at `READY_FOR_VERIFICATION`.  
`codex/dispatch.mjs` set **BLOCKED**: Codex CLI not on PATH.  
Cursor **will not** self-certify. Install Codex → re-run `node AI-HANDOFF/codex/dispatch.mjs`.

Evidence: `AI-HANDOFF/EVIDENCE/PP-SEC-001-DEPLOY.md`
