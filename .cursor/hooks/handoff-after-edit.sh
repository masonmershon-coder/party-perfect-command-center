#!/usr/bin/env bash
# Cursor afterFileEdit: when AI-HANDOFF peer docs change, bump PING + notify.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PING_SCRIPT="$ROOT/scripts/ai-handoff-ping.sh"

input="$(cat || true)"

# Extract path from hook JSON (field names vary by Cursor version)
path="$(python3 -c '
import json,sys
raw=sys.stdin.read() or "{}"
try:
  d=json.loads(raw)
except Exception:
  d={}
for k in ("file_path","filePath","path","uri"):
  v=d.get(k)
  if isinstance(v,str) and v:
    print(v); break
else:
  # nested
  for nest in ("file","input","tool_input"):
    n=d.get(nest) or {}
    if isinstance(n,dict):
      for k in ("file_path","filePath","path"):
        v=n.get(k)
        if isinstance(v,str) and v:
          print(v); raise SystemExit
' <<<"$input" 2>/dev/null || true)"

# Only care about handoff mailbox files (not PING / relay state — avoid loops)
case "$path" in
  *AI-HANDOFF/CURSOR_TO_CLAUDE.md|*AI-HANDOFF/CURRENT_TASK.md|*AI-HANDOFF/CLAUDE_TO_CURSOR.md|*AI-HANDOFF/BLOCKERS.md|*AI-HANDOFF/REVIEW_QUEUE.md) ;;
  *) echo '{}'; exit 0 ;;
esac

# Don't ping on our own PING writes
case "$path" in
  *AI-HANDOFF/PING.json*|*AI-HANDOFF/.relay-state*) echo '{}'; exit 0 ;;
esac

status="CURSOR_UPDATE"
summary="Cursor updated $(basename "$path")"
if [[ -f "$ROOT/AI-HANDOFF/CURRENT_TASK.md" ]]; then
  status="$(grep -E '^\*\*STATUS:\*\*|^STATUS:' "$ROOT/AI-HANDOFF/CURRENT_TASK.md" 2>/dev/null | head -n1 | sed -E 's/.*STATUS:\*\*[[:space:]]*//;s/^STATUS:[[:space:]]*//' | cut -c1-80 || echo CURSOR_UPDATE)"
fi

# Cursor edits → Claude's mailbox (relay notifies / may auto-wake Claude)
if [[ -x "$PING_SCRIPT" ]]; then
  "$PING_SCRIPT" --from cursor --to claude --status "$status" --summary "$summary" --notify >/dev/null 2>&1 || true
fi

# Fail open — never block edits
echo '{}'
