#!/usr/bin/env bash
# Reproducible test harness for INDEPENDENT verification.
#
#   bash AI-HANDOFF/run-suites.sh
#
# Every suite here is redirected to a scratch dir, so a read-only verifier (Codex runs
# sandboxed read-only on the repo) can re-derive the numbers instead of trusting the
# owner's reported counts. Nothing in the repository is written.
#
# Codex finding `regression-evidence-incomplete`: the gateway and Sentinel suites used
# to append to SECURITY_AUDIT.jsonl / SECURITY_EVENTS.jsonl inside the repo, so the
# verifier could not run them at all and could only count assertions statically.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

export PP_SECURITY_AUDIT_PATH="$SCRATCH/SECURITY_AUDIT.jsonl"
export PP_SECURITY_EVENTS_PATH="$SCRATCH/SECURITY_EVENTS.jsonl"
export PP_SENTINEL_HEALTH_PATH="$SCRATCH/sentinel-health.json"

fails=0
run() {
  echo "=== $1 ==="
  shift
  if node "$@"; then :; else fails=$((fails + 1)); fi
  echo
}

run "github ingest bridge"  "$ROOT/AI-HANDOFF/bridge/github-ingest.mjs" --test
run "matter security gateway" "$ROOT/AI-HANDOFF/matter/security-gateway.mjs" --test
run "sentinel synthetic incidents" "$ROOT/AI-HANDOFF/sentinel/test-sentinel.mjs"

# Prove the redirection actually held — a suite that silently wrote into the repo
# would make this harness a false green.
if [ -s "$PP_SECURITY_AUDIT_PATH" ] || [ -s "$PP_SECURITY_EVENTS_PATH" ]; then
  echo "redirection confirmed: suites wrote to the scratch dir, not the repo"
else
  echo "WARNING: no scratch output — redirection may not be in effect"
  fails=$((fails + 1))
fi

echo
[ "$fails" -eq 0 ] && echo "ALL SUITES PASSED" || echo "$fails SUITE(S) FAILED"
exit "$fails"
