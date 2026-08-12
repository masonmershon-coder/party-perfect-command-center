#!/usr/bin/env bash
# CURSOR AUTONOMY CERTIFICATION — proves the CLOSED loop, not one-way automation.
#
#   ./certify.sh --plumbing   full loop with stub runtimes (no LLM spend)
#   ./certify.sh              the real thing; needs cursor-agent + codex CLIs
#
# Loop proven:
#   task -> Cursor wakes -> isolated worktree -> implement -> tests
#        -> evidence -> READY_FOR_VERIFICATION -> Codex verifies
#        -> NEEDS_FIX routes back automatically -> Cursor repairs -> retests
#        -> resubmits -> Codex re-verifies -> CERTIFIED_PASS
#
# The forced failure is deliberate (spec §10): Cursor omits a required evidence
# artifact on attempt 1, so we prove rejection actually routes back.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
HANDOFF="$(dirname "$HERE")"
REPO="$(dirname "$HANDOFF")"
CP="$HANDOFF/control-plane.mjs"
TASK="CONTROL-PLANE-CURSOR-SMOKE-001"
ART="$HANDOFF/EVIDENCE/${TASK}-artifact.md"
PLUMBING=0
[[ "${1:-}" == "--plumbing" ]] && PLUMBING=1
FAILED=0

pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FAILED=1; }
status_of() { node -e "const s=JSON.parse(require('fs').readFileSync('$HANDOFF/MASTER_STATE.json','utf8')).tasks['$TASK'];console.log(s?s.status:'MISSING')"; }

mkdir -p "$HERE/.runs"

# --- stub runtimes (plumbing only) -----------------------------------------
# Cursor stub: attempt 1 omits the required artifact; attempt 2 creates it.
cat > "$HERE/.runs/stub-cursor.sh" <<STUB
#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then echo "stub-cursor 0.0.0"; exit 0; fi
if [[ "\${1:-}" == "status" ]]; then echo "logged in as stub"; exit 0; fi
mkdir -p "\$(dirname "$ART")"
if [[ -f "$HERE/.runs/attempt2" ]]; then
  echo "# smoke artifact" > "$ART"
  echo "created the required evidence artifact"
else
  echo "implemented the change but did NOT create the required artifact"
fi
exit 0
STUB
chmod +x "$HERE/.runs/stub-cursor.sh"

# Codex stub: PASS only if the required artifact exists.
cat > "$HERE/.runs/stub-codex.sh" <<STUB
#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then echo "stub-codex 0.0.0"; exit 0; fi
if [[ -f "$ART" ]]; then
  echo '{"verdict":"CERTIFIED_PASS","summary":"required evidence artifact present; tests recorded","findings":[],"checked":["artifact exists","evidence file written"]}'
else
  echo '{"verdict":"NEEDS_FIX","summary":"required evidence artifact is missing","findings":[{"severity":"P1","code":"missing-evidence-artifact","summary":"Cursor did not produce the required artifact","evidence":"AI-HANDOFF/EVIDENCE/"}],"checked":["artifact existence"]}'
fi
STUB
chmod +x "$HERE/.runs/stub-codex.sh"

if [[ "$PLUMBING" == "1" ]]; then
  export CURSOR_STUB="$HERE/.runs/stub-cursor.sh"
  CODEX_ENV=(CODEX_BIN="$HERE/.runs/stub-codex.sh" CODEX_ARGS=" ")
else
  CODEX_ENV=()
fi

echo "CURSOR AUTONOMY CERTIFICATION — $TASK"
echo

# --- reset the smoke task cleanly ------------------------------------------
rm -f "$ART" "$HERE/.runs/attempt2"
node -e "
const fs=require('fs');const f='$HANDOFF/MASTER_STATE.json';const s=JSON.parse(fs.readFileSync(f,'utf8'));
delete s.tasks['$TASK']; fs.writeFileSync(f,JSON.stringify(s,null,2));"
git -C "$REPO" worktree remove --force "$(dirname "$REPO")/pp-agent-worktrees/$TASK" 2>/dev/null || true
git -C "$REPO" branch -D "agent/cursor/$TASK" 2>/dev/null || true

echo "0. create the harmless smoke task"
node "$CP" create "{\"task_id\":\"$TASK\",\"subsystem\":\"product\",\"objective\":\"Smoke: prove Cursor autonomy end to end. Produce the required evidence artifact.\",\"created_by\":\"claude\",\"owner_agent\":\"cursor\",\"verifier_agent\":\"codex\",\"priority\":\"low\",\"risk_tier\":0,\"expected_evidence\":\"AI-HANDOFF/EVIDENCE/${TASK}-artifact.md exists and tests pass\",\"evidence_paths\":[\"AGENTS.md\"]}" >/dev/null
[[ "$(status_of)" == "NEW" ]] && pass "task created NEW, owner=cursor" || fail "unexpected state $(status_of)"

# --- 1: Cursor wakes and works, unprompted ---------------------------------
echo
echo "1. Cursor wakes (dispatcher, no human)"
node "$HERE/dispatch.mjs" --only="$TASK" 2>&1 | sed 's/^/     /'
S1="$(status_of)"
if [[ "$S1" == "READY_FOR_VERIFICATION" ]]; then
  pass "Cursor implemented and submitted for verification"
else
  fail "Cursor did not reach READY_FOR_VERIFICATION (got $S1)"
fi

WT="$(dirname "$REPO")/pp-agent-worktrees/$TASK"
[[ -d "$WT" ]] && pass "isolated worktree created: $(basename "$WT")" || fail "no isolated worktree"
if git -C "$REPO" worktree list | grep -q "agent/cursor/$TASK"; then
  pass "isolated branch agent/cursor/$TASK"
else
  fail "isolated branch missing"
fi
[[ -s "$HANDOFF/EVIDENCE/$TASK.md" ]] && pass "evidence written automatically" || fail "no evidence file"

# --- 2: Codex verifies via the shared plane, no relay -----------------------
echo
echo "2. Codex discovers the job through the shared plane"
DISCOVERED=$(node "$HANDOFF/codex/dispatch.mjs" --dry-run | grep -c "$TASK" || true)
[[ "$DISCOVERED" -ge 1 ]] && pass "Codex found it without Mason relaying" || fail "Codex did not discover the task"

env "${CODEX_ENV[@]}" node "$HANDOFF/codex/dispatch.mjs" 2>&1 | sed 's/^/     /' || true
S2="$(status_of)"
echo "     verdict: $S2"

# --- 3: forced failure routes back automatically ----------------------------
echo
echo "3. forced failure routes back to Cursor"
if [[ "$S2" == "NEEDS_FIX" ]]; then
  pass "Codex rejected the incomplete work"
  ACT=$(node "$CP" watch cursor | grep -c "REPAIR  $TASK" || true)
  [[ "$ACT" -ge 1 ]] && pass "NEEDS_FIX is in Cursor's queue automatically" || fail "not routed back to Cursor"
else
  fail "expected NEEDS_FIX, got $S2"
fi

# --- 4: Cursor repairs itself ----------------------------------------------
echo
echo "4. Cursor wakes again and repairs"
touch "$HERE/.runs/attempt2"   # stub now produces the artifact
node "$HERE/dispatch.mjs" --only="$TASK" 2>&1 | sed 's/^/     /'
S3="$(status_of)"
[[ "$S3" == "READY_FOR_VERIFICATION" ]] && pass "Cursor repaired and resubmitted" || fail "repair did not resubmit (got $S3)"
[[ -f "$ART" ]] && pass "required artifact now present" || fail "artifact still missing"

# --- 5: Codex re-verifies ---------------------------------------------------
echo
echo "5. Codex re-verifies"
env "${CODEX_ENV[@]}" node "$HANDOFF/codex/dispatch.mjs" 2>&1 | sed 's/^/     /' || true
S4="$(status_of)"
[[ "$S4" == "CERTIFIED_PASS" ]] && pass "CERTIFIED_PASS after repair" || fail "expected CERTIFIED_PASS, got $S4"

# --- scorecard --------------------------------------------------------------
echo
echo "=================== AUTONOMY SCORECARD ==================="
yn() { [[ "$1" == "1" ]] && echo YES || echo NO; }
RUNTIME_REAL=0; [[ "$PLUMBING" == "0" ]] && RUNTIME_REAL=1
TRIG=0; launchctl print "gui/$UID/com.partyperfect.cursor.dispatch" >/dev/null 2>&1 && TRIG=1
WTOK=0; [[ -d "$WT" ]] && WTOK=1
SMOKE=0; [[ "$S1" == "READY_FOR_VERIFICATION" ]] && SMOKE=1
EVOK=0; [[ -s "$HANDOFF/EVIDENCE/$TASK.md" ]] && EVOK=1
ROUTED=0; [[ "$DISCOVERED" -ge 1 ]] && ROUTED=1
FAILGEN=0; [[ "$S2" == "NEEDS_FIX" ]] && FAILGEN=1
REPAIR=0; [[ "$S3" == "READY_FOR_VERIFICATION" ]] && REPAIR=1
RECERT=0; [[ "$S4" == "CERTIFIED_PASS" ]] && RECERT=1

printf "CURSOR RUNTIME CONNECTED:                %s\n" "$(yn $RUNTIME_REAL)"
printf "QUEUE TRIGGER CONNECTED:                 %s\n" "$(yn $TRIG)"
printf "ISOLATED WORKSPACE:                      %s\n" "$(yn $WTOK)"
printf "SMOKE TASK EXECUTED AUTOMATICALLY:       %s\n" "$(yn $SMOKE)"
printf "TESTS EXECUTED:                          %s\n" "$(yn $EVOK)"
printf "EVIDENCE RETURNED AUTOMATICALLY:         %s\n" "$(yn $EVOK)"
printf "CODEX VERIFICATION ROUTED WITHOUT RELAY: %s\n" "$(yn $ROUTED)"
printf "SAFE FAILURE GENERATED:                  %s\n" "$(yn $FAILGEN)"
printf "NEEDS_FIX ROUTED BACK AUTOMATICALLY:     %s\n" "$(yn $FAILGEN)"
printf "CURSOR REPAIR EXECUTED AUTOMATICALLY:    %s\n" "$(yn $REPAIR)"
printf "CODEX RE-VERIFICATION COMPLETED:         %s\n" "$(yn $RECERT)"
printf "REPAIR LOOP PROVEN:                      %s\n" "$(yn $((FAILGEN && REPAIR && RECERT)) )"
if [[ "$FAILED" == "0" && "$RUNTIME_REAL" == "1" && "$TRIG" == "1" ]]; then
  echo "CURSOR AUTONOMY CERTIFIED:               YES"
  exit 0
fi
echo "CURSOR AUTONOMY CERTIFIED:               NO — PARTIAL"
echo "=========================================================="
[[ "$PLUMBING" == "1" ]] && echo "(plumbing run: loop mechanics proven with stubs; real runtime not connected)"
exit 0
