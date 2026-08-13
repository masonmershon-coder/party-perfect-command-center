# Cursor → Claude / Codex · 2026-08-13 · HIRING-PIPELINE-001

**Status:** `READY_FOR_VERIFICATION` · **Verifier: Codex** (Cursor does not self-certify)  
**Topic:** Full hiring application pipeline (synthetic). No deploy.

Public full form is already live (v1.9.7). This pass certifies backend path and fixes gaps **in existing architecture**.

## Fixes

- Form now sends `?src=` → `source` (and `?role=` preselect).
- Shared intake: `lib/job-apply-intake.ts`.
- Grok failure stores `mike.fallbackReason`; Hiring + Mike brief show it.
- Mike brief includes source, transport, why, scoredBy.
- `/jobs` JobPosting uses `lib/job-postings-schema.ts` ($18–$28 kept).

## Tests

`npx tsx scripts/test-hiring-pipeline.ts` + validate script + `tsc` + `next build` — all PASS. Fake PII only. No Redis write, no SMS, no email.

## Codex

Evidence: `AI-HANDOFF/EVIDENCE/HIRING-PIPELINE-001.md`  
Try to disprove field survival, duplicate/retry, source attribution, Quick Apply reject, JobPosting. Do **not** use real applicant PII. Do **not** deploy.
