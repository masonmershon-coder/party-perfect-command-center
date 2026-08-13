# HIRING-PIPELINE-001 — full application path (synthetic)

**Owner:** Cursor · **Verifier:** Codex · **Do not deploy** until Codex + normal gate.  
**Branch:** `release/v1.9.7-full-jobs` · **No real applicant PII used.**

## Claim

The restored full application survives the existing path:

`partyperfectjobs.com form → /api/jobs/apply → Redis job store → Command Center Hiring → Mike scoring / Mike brief`

No parallel hiring database. No applicant outbound messages. Quick Apply remains rejected. JobPosting JSON-LD still valid.

## Defects found and fixed (in-repo)

| Gap | Fix |
|-----|-----|
| `?src=` never sent from the form (source always `direct`) | Restored `useSearchParams` + `source: leadSource` on submit; `?role=` preselect |
| Intake mapping lived only in the API route | Extracted `lib/job-apply-intake.ts` (`buildJobApplicationInputFromBody`, `resolveApplyMode`) |
| Grok fail looked like a normal heuristic score | `mike.fallbackReason` stored + shown in Hiring + Mike brief |
| Mike chat brief omitted source / transport / why | `formatHiringAppsForMike` detail cards expanded |
| JobPosting duplicated inline on `/jobs` | Page now uses `buildJobPostingJsonLd` (keeps $18–$28, `directApply`, `?src=google&role=`) |

## Tests (local)

```
npx tsx scripts/test-job-apply-validate.ts   # PASS
npx tsx scripts/test-hiring-pipeline.ts      # PASS (synthetic only)
npx tsc --noEmit                             # PASS
npx next build                               # PASS
```

Pipeline script covers: required fields round-trip, source attribution, roles, availability, work history, duplicate/retry (no second row), Mike heuristic score stored, owner-visible record shape, Mike brief contents, fallbackReason visibility, Quick Apply reject, JobPosting schema.

## Unverified (Codex)

1. Live Redis write of a synthetic app on production (Cursor did **not** POST to live apply — would pollute Hiring).
2. Live Grok `scoredBy: "grok"` path (test uses heuristic only; no paid Grok call).
3. Backup email + 503 save-failure UI on real Upstash outage.
4. Owner browser: Hiring detail shows fallbackReason + source after a real (synthetic) submit.
5. Google rich-results still accept the wired JobPosting after next deploy.

## Reproduction / independent check

1. `npx tsx scripts/test-hiring-pipeline.ts`
2. Confirm `app/components/jobs/jobs-application.tsx` sends `source: leadSource`.
3. Confirm `resolveApplyMode({ applyMode: "quick" })` errors.
4. Confirm `app/jobs/page.tsx` imports `buildJobPostingJsonLd`.
5. After deploy (not this task): one fake apply `Test Applicant Cursor Pipeline` / `example.com` with `?src=indeed`, then Hiring + Mike brief.

## Deployment status

**NOT DEPLOYED.** Production remains **v1.9.7** until normal release/verification gate.
