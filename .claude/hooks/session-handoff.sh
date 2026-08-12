#!/usr/bin/env bash
# Claude Code SessionStart: inject AI-HANDOFF summary + watch peer files.
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
CURRENT="$ROOT/AI-HANDOFF/CURRENT_TASK.md"
TO_CLAUDE="$ROOT/AI-HANDOFF/CURSOR_TO_CLAUDE.md"
BLOCKERS="$ROOT/AI-HANDOFF/BLOCKERS.md"
PING="$ROOT/AI-HANDOFF/PING.json"

cat >/dev/null || true

ctx="Party Perfect AI-HANDOFF: before substantive work read AI-HANDOFF/CURRENT_TASK.md, CURSOR_TO_CLAUDE.md, DECISIONS.md, BLOCKERS.md, PING.json. Never put secrets in handoff. Update CLAUDE_TO_CURSOR.md + CURRENT_TASK when you finish a cycle. Relay may auto-wake you on READY_FOR_CLAUDE* when AUTO_RELAY.enabled exists."

if [[ -f "$CURRENT" ]]; then
  head_txt="$(grep -v '^[[:space:]]*$' "$CURRENT" | head -n 14 | tr '\n' ' ' | cut -c1-900)"
  ctx="$ctx CURRENT_TASK: $head_txt"
fi
if [[ -f "$TO_CLAUDE" ]]; then
  peer="$(grep -v '^[[:space:]]*$' "$TO_CLAUDE" | head -n 10 | tr '\n' ' ' | cut -c1-600)"
  ctx="$ctx CURSOR_TO_CLAUDE: $peer"
fi
if [[ -f "$BLOCKERS" ]] && grep -q 'OPEN' "$BLOCKERS" 2>/dev/null; then
  ctx="$ctx Open blockers — read BLOCKERS.md."
fi
if [[ -f "$PING" ]]; then
  ping_txt="$(tr '\n' ' ' <"$PING" | cut -c1-300)"
  ctx="$ctx PING: $ping_txt"
fi

python3 - "$ctx" "$TO_CLAUDE" "$CURRENT" "$PING" "$ROOT/AI-HANDOFF/CLAUDE_TO_CURSOR.md" <<'PY'
import json, sys
ctx, *paths = sys.argv[1:]
paths = [p for p in paths if p]
print(json.dumps({
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": ctx,
    "watchPaths": paths,
  }
}))
PY
