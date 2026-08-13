#!/usr/bin/env bash
# Cursor afterFileEdit -> control-plane activity. Deterministic, no LLM, no secrets.
# Closes OBS-CURSOR-VISIBILITY-001: substantive Cursor work must register itself.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PAYLOAD="$(cat || true)"                    # consume stdin so the pipe never breaks
FILE="$(printf '%s' "$PAYLOAD" | /usr/bin/python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    print(d.get('file_path') or d.get('path') or d.get('filePath') or '')
except Exception:
    print('')
" 2>/dev/null || true)"
[ -n "$FILE" ] && node "$ROOT/AI-HANDOFF/cursor/activity-recorder.mjs" file-edit "$FILE" >/dev/null 2>&1 || true
exit 0
