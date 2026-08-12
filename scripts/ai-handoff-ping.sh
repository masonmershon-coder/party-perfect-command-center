#!/usr/bin/env bash
# Write AI-HANDOFF/PING.json and optionally notify macOS Notification Center.
# Usage: ai-handoff-ping.sh --from cursor|claude --to claude|cursor --status STATUS [--summary "..."] [--notify]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PING_FILE="$ROOT/AI-HANDOFF/PING.json"
STATE_DIR="$ROOT/AI-HANDOFF/.relay-state"
mkdir -p "$(dirname "$PING_FILE")" "$STATE_DIR"

FROM=""
TO=""
STATUS=""
SUMMARY=""
NOTIFY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from) FROM="${2:-}"; shift 2 ;;
    --to) TO="${2:-}"; shift 2 ;;
    --status) STATUS="${2:-}"; shift 2 ;;
    --summary) SUMMARY="${2:-}"; shift 2 ;;
    --notify) NOTIFY=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$FROM" || -z "$TO" || -z "$STATUS" ]]; then
  echo "Required: --from --to --status" >&2
  exit 1
fi

# Never allow secret-looking content in summary
SUMMARY="$(printf '%s' "$SUMMARY" | tr '\n' ' ' | cut -c1-240)"
if printf '%s' "$SUMMARY" | grep -Eiq 'password|secret|token|api[_-]?key|postgres://|postgresql://|sk-|Bearer '; then
  SUMMARY="(summary redacted — possible secret)"
fi

ID="$(date -u +%Y%m%dT%H%M%SZ)-$FROM"
UPDATED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

python3 - "$PING_FILE" "$ID" "$FROM" "$TO" "$STATUS" "$SUMMARY" "$UPDATED" <<'PY'
import json, sys
path, pid, frm, to, status, summary, updated = sys.argv[1:8]
payload = {
    "id": pid,
    "from": frm,
    "to": to,
    "status": status,
    "summary": summary,
    "updated_at": updated,
    "acked_by": None,
    "acked_at": None,
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
print(path)
PY

if [[ "$NOTIFY" -eq 1 ]]; then
  title="Party Perfect handoff → ${TO}"
  body="${STATUS}: ${SUMMARY:-check AI-HANDOFF}"
  # Best-effort; fail open if notifications unavailable (CI/sandbox).
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"${body//\"/\\\"}\" with title \"${title//\"/\\\"}\"" 2>/dev/null || true
  fi
fi
