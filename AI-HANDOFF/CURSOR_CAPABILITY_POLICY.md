# Cursor Capability Policy (Codex should audit this)

Explicit permission model for the autonomous `cursor` worker. Maps to the control-plane approval tiers.

## AUTO-ALLOWED (Tier 0–1 — no approval; log only)
- read / search repository
- edit files **in an isolated task branch/worktree/cloud checkout only**
- run local commands, lint, typecheck, tests, local builds
- create commits on the task branch
- open a **draft** PR
- write evidence to `AI-HANDOFF/EVIDENCE/`
- update its own task status up to `READY_FOR_VERIFICATION`

## APPROVAL REQUIRED (Tier 3–4 — Mason, unless policy pre-authorizes)
- production deployment (Vercel prod)
- production environment-variable changes
- database migrations / `supabase db push`
- production SQL writes
- **any POR write**
- credential/secret changes
- deleting production resources
- customer-facing communications
- paid-service changes

## Invariants
- **Never** edit a dirty shared worktree (Claude/human uncommitted work) — isolate per task (`agent/cursor/<TASK_ID>`).
- **Never** set `CERTIFIED_PASS` on its own work (engine-enforced: owner≠verifier).
- **Never** put a secret value in a task record, commit, or PR — reference a store (`secret_store: <name>`).
- **Never** merge to `main` autonomously — draft PR + Codex certification + human/policy merge gate.
- No destructive git (`reset --hard`, force-push over others, branch deletion) on shared branches.
