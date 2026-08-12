#!/usr/bin/env bash
# Claude Code FileChanged: when Cursor updates handoff, notify + bump awareness.
# (FileChanged cannot inject additionalContext into the live turn — side effects only.)
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
PING_SCRIPT="$ROOT/scripts/ai-handoff-ping.sh"

input="$(cat || true)"
file="$(python3 -c '
import json,sys
try:
  d=json.loads(sys.stdin.read() or "{}")
except Exception:
  d={}
for k in ("file_path","path","filename"):
  v=d.get(k)
  if isinstance(v,str) and v:
    print(v); break
' <<<"$input" 2>/dev/null || true)"

base="$(basename "$file" 2>/dev/null || true)"
case "$base" in
  CURSOR_TO_CLAUDE.md|CURRENT_TASK.md|PING.json|BLOCKERS.md) ;;
  *) echo '{}'; exit 0 ;;
esac

status="PEER_UPDATE"
if [[ -f "$ROOT/AI-HANDOFF/CURRENT_TASK.md" ]]; then
  status="$(grep -E '^\*\*STATUS:\*\*|^STATUS:' "$ROOT/AI-HANDOFF/CURRENT_TASK.md" 2>/dev/null | head -n1 | sed -E 's/.*STATUS:\*\*[[:space:]]*//;s/^STATUS:[[:space:]]*//' | cut -c1-80 || echo PEER_UPDATE)"
fi

if [[ -x "$PING_SCRIPT" ]]; then
  # Notify Mason that Claude's session saw a Cursor update (Claude may need a new turn / bg wake via relay)
  "$PING_SCRIPT" --from cursor --to claude --status "$status" --summary "FileChanged: $base" --notify >/dev/null 2>&1 || true
fi

# Keep watching the same set
python3 - "$ROOT/AI-HANDOFF/CURSOR_TO_CLAUDE.md" "$ROOT/AI-HANDOFF/CURRENT_TASK.md" "$ROOT/AI-HANDOFF/PING.json" <<'PY'
import json, sys
print(json.dumps({"watchPaths": list(sys.argv[1:])}))
PY
