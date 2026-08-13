#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cat >/dev/null || true
node "$ROOT/AI-HANDOFF/cursor/activity-recorder.mjs" session-start >/dev/null 2>&1 || true
exit 0
