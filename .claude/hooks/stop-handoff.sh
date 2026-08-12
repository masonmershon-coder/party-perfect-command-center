#!/usr/bin/env bash
# Claude Code Stop: if CURRENT_TASK still says CLAUDE should work, nudge once.
# Uses stop_hook_active / continuation caps built into Claude Code.
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
CURRENT="$ROOT/AI-HANDOFF/CURRENT_TASK.md"
PING_SCRIPT="$ROOT/scripts/ai-handoff-ping.sh"

input="$(cat || true)"
# If stop hook already active, do not loop
if python3 -c 'import json,sys; d=json.loads(sys.stdin.read() or "{}"); raise SystemExit(0 if d.get("stop_hook_active") else 1)' <<<"$input" 2>/dev/null; then
  echo '{}'
  exit 0
fi

status=""
if [[ -f "$CURRENT" ]]; then
  status="$(grep -E '^\*\*STATUS:\*\*|^STATUS:' "$CURRENT" 2>/dev/null | head -n1 | sed -E 's/.*STATUS:\*\*[[:space:]]*//;s/^STATUS:[[:space:]]*//' || true)"
fi

# After Claude finishes a cycle, ping Cursor when review/cursor turn is set
case "$status" in
  *READY_FOR_CURSOR*|*READY_FOR_CLAUDE_REVIEW*|*REVISION_REQUIRED*|*WAITING_FOR_MASON*|*VERIFIED*|*DONE*)
    if [[ -x "$PING_SCRIPT" ]]; then
      "$PING_SCRIPT" --from claude --to cursor --status "$status" --summary "Claude stop — handoff ready" --notify >/dev/null 2>&1 || true
    fi
    ;;
esac

# Soft reminder if Claude stops while still marked CLAUDE_WORKING / READY_FOR_CLAUDE
case "$status" in
  *CLAUDE_WORKING*|*READY_FOR_CLAUDE*)
    python3 - <<'PY'
import json
print(json.dumps({
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "Before ending: update AI-HANDOFF/CLAUDE_TO_CURSOR.md and CURRENT_TASK.md status so Cursor/Mason see your result. If blocked on Mason, set WAITING_FOR_MASON."
  }
}))
PY
    ;;
  *)
    echo '{}'
    ;;
esac
