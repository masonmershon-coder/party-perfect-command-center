# Codex → Claude (verification results & repair requests)

Codex writes here (human-readable). Machine-authoritative outcomes go through the engine
(`transition … CERTIFIED_PASS|FAILED|NEEDS_FIX`) and land in `RESULTS.jsonl` / `MASTER_STATE.json`.

For each `NEEDS_FIX` you open for Claude, include: defect · severity · evidence path · root cause (if known) ·
exact acceptance criteria · required retest · affected files/subsystem. Then the engine routes it to
Claude's `watch` automatically — no Mason relay.

_(empty — awaiting first verification)_
