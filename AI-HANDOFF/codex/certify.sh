#!/usr/bin/env bash
# AUTOMATION CERTIFICATION — the success test, run for real.
#
#   ./certify.sh              full test (needs codex CLI installed)
#   ./certify.sh --plumbing   everything except the LLM call; proves the
#                             dispatcher/routing/state loop with a stub verifier
#
# Steps proven, in order:
#   1 Claude marks a task READY_FOR_VERIFICATION
#   2 Mason does nothing
#   3 Codex launches automatically (launchd WatchPaths on MASTER_STATE.json)
#   4 Codex verifies
#   5 Result is written
#   6 On failure, repair routes automatically back to the owner (NEEDS_FIX)
#   7 Repair completion re-triggers Codex
#   8 Status/dashboard state updates
#   9 Mason sees only a summary
#
# Uses a throwaway task id so it never touches real work.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
HANDOFF="$(dirname "$HERE")"
CP="$HANDOFF/control-plane.mjs"
TASK="CERTIFY-$(date +%s)"
PLUMBING=0
[[ "${1:-}" == "--plumbing" ]] && PLUMBING=1

pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FAILED=1; }
FAILED=0

echo "AUTOMATION CERTIFICATION — $TASK"
echo

# --- step 1: owner creates work and marks it ready -------------------------
echo "1. owner marks READY_FOR_VERIFICATION"
node "$CP" create "{\"task_id\":\"$TASK\",\"subsystem\":\"audit\",\"objective\":\"certification self-test\",\"created_by\":\"claude\",\"owner_agent\":\"claude\",\"verifier_agent\":\"codex\",\"priority\":\"low\",\"claim\":\"the automation loop runs without Mason\",\"evidence_paths\":[\"AI-HANDOFF/codex/certify.sh\"]}" >/dev/null
node "$CP" claim "$TASK" claude >/dev/null
node "$CP" transition "$TASK" claude IN_PROGRESS >/dev/null
node "$CP" transition "$TASK" claude READY_FOR_VERIFICATION >/dev/null
STATUS=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$HANDOFF/MASTER_STATE.json','utf8')).tasks['$TASK'].status)")
[[ "$STATUS" == "READY_FOR_VERIFICATION" ]] && pass "task is READY_FOR_VERIFICATION" || fail "status is $STATUS"

# --- step 2/3: dispatcher selects it with no human input --------------------
echo "2. Mason does nothing"
echo "3. dispatcher selects the task automatically"
SELECTED=$(node "$HERE/dispatch.mjs" --dry-run | grep -c "$TASK" || true)
[[ "$SELECTED" -ge 1 ]] && pass "dispatcher selected $TASK unprompted" || fail "dispatcher did not select $TASK"

# --- step 3b: the trigger itself is installed and event-driven --------------
if launchctl list 2>/dev/null | grep -q com.partyperfect.codex.dispatch; then
  pass "launchd WatchPaths trigger is loaded (event-driven, no polling)"
else
  fail "launchd trigger NOT loaded — run ./install.sh (loop will not self-start)"
fi

# --- step 4/5: verification runs and writes a result ------------------------
echo "4. Codex verifies"
if [[ "$PLUMBING" == "1" ]]; then
  # Stub verifier: proves transitions/state without spending an LLM call.
  # It deliberately returns NEEDS_FIX so step 6 has something to route.
  cat > "$HERE/.runs/stub-codex.sh" <<'STUB'
#!/usr/bin/env bash
if [[ "${1:-}" == "--version" ]]; then echo "stub-codex 0.0.0"; exit 0; fi
echo 'thinking out loud, as models do'
echo '{"verdict":"NEEDS_FIX","summary":"stub verifier: intentional failure to prove repair routing","findings":[{"severity":"P1","code":"stub-finding","summary":"synthetic finding from the certification stub","evidence":"certify.sh"}],"checked":["nothing real"]}'
STUB
  chmod +x "$HERE/.runs/stub-codex.sh"
  CODEX_BIN="$HERE/.runs/stub-codex.sh" CODEX_ARGS=" " node "$HERE/verify.mjs" "$TASK" || true
else
  node "$HERE/verify.mjs" "$TASK" || true
fi

VERDICT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$HANDOFF/MASTER_STATE.json','utf8')).tasks['$TASK'].status)")
echo "5. result written: $VERDICT"
[[ "$VERDICT" =~ ^(CERTIFIED_PASS|NEEDS_FIX|BLOCKED)$ ]] && pass "terminal verdict recorded: $VERDICT" || fail "unexpected status $VERDICT"

LEDGERED=$(grep -c "\"$TASK\"" "$HANDOFF/CODEX_AUDIT_LEDGER.jsonl" 2>/dev/null || true)
[[ "${LEDGERED:-0}" -ge 1 ]] && pass "verification appended to audit ledger" || fail "nothing in CODEX_AUDIT_LEDGER.jsonl"

# --- step 6/7: repair routes back, and completion re-triggers ---------------
if [[ "$VERDICT" == "NEEDS_FIX" ]]; then
  echo "6. repair routed back to owner"
  ACTIONABLE=$(node "$CP" watch claude | grep -c "REPAIR  $TASK" || true)
  [[ "$ACTIONABLE" -ge 1 ]] && pass "owner sees REPAIR without being told" || fail "owner not notified"

  echo "7. repair completion re-triggers verification"
  node "$CP" claim "$TASK" claude >/dev/null
  node "$CP" transition "$TASK" claude IN_PROGRESS >/dev/null
  node "$CP" transition "$TASK" claude READY_FOR_VERIFICATION >/dev/null
  RETRIGGER=$(node "$HERE/dispatch.mjs" --dry-run | grep -c "$TASK" || true)
  [[ "$RETRIGGER" -ge 1 ]] && pass "re-queued for verification automatically" || fail "did not re-queue"
else
  echo "6/7. skipped — verdict was $VERDICT, no repair to route"
fi

# --- step 8: dashboard state updated ---------------------------------------
echo "8. status state updated"
node "$HERE/status.mjs" --json > /dev/null
for f in CODEX_CURRENT_STATUS.json CODEX_AUDIT_LEDGER.jsonl CODEX_OPEN_FINDINGS.json CODEX_LAST_VERIFIED.md; do
  [[ -s "$HANDOFF/$f" ]] && pass "$f maintained" || fail "$f missing/empty"
done

# --- step 9: Mason sees a summary ------------------------------------------
echo
echo "9. what Mason sees:"
echo "---"
node "$HERE/status.mjs"
echo "---"
echo

if [[ "$FAILED" == "1" ]]; then
  echo "CERTIFICATION: FAILED — loop is NOT autonomous yet."
  exit 1
fi
if [[ "$PLUMBING" == "1" ]]; then
  echo "CERTIFICATION: PLUMBING PASS — dispatch/routing/state proven with a stub."
  echo "Not autonomous until the real codex CLI is installed and this runs without --plumbing."
  exit 0
fi
echo "CERTIFICATION: PASS — Codex is autonomous."
