#!/usr/bin/env bash
# Best-effort handoff injector for Cursor sessionStart.
# NOTE: Cursor IDE may drop sessionStart additional_context (known race).
# The always-apply rule in .cursor/rules/ai-handoff.mdc is the reliable path.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CURRENT="$ROOT/AI-HANDOFF/CURRENT_TASK.md"
BLOCKERS="$ROOT/AI-HANDOFF/BLOCKERS.md"

# Consume stdin (hook payload) so the pipe does not break.
cat >/dev/null || true

summary="Party Perfect AI-HANDOFF: before substantive work, read AI-HANDOFF/CURRENT_TASK.md, CLAUDE_TO_CURSOR.md, DECISIONS.md, BLOCKERS.md, and git status."

if [[ -f "$CURRENT" ]]; then
  # First ~12 non-empty lines — keep short; no secrets should be in these files.
  head_txt="$(grep -v '^[[:space:]]*$' "$CURRENT" | head -n 12 | tr '\n' ' ' | cut -c1-800)"
  summary="$summary CURRENT_TASK: $head_txt"
fi

if [[ -f "$BLOCKERS" ]] && grep -q 'OPEN' "$BLOCKERS" 2>/dev/null; then
  summary="$summary Open blockers exist — read AI-HANDOFF/BLOCKERS.md."
fi

# JSON-escape via python3 (required dependency check: python3 on PATH)
python3 - "$summary" <<'PY'
import json, sys
ctx = sys.argv[1] if len(sys.argv) > 1 else ""
print(json.dumps({"additional_context": ctx}))
PY
