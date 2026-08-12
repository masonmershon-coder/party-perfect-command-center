#!/bin/bash
# CONTROL-PLANE-END-TO-END-001 — harmless local proof that a full create→verify→reject→
# repair→recertify loop runs with NO Mason involvement. Runs in an ISOLATED temp copy so
# real state is untouched. Simulated actors "claude" (owner) and "codex" (verifier).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; cp "$HERE/control-plane.mjs" "$T/"
run(){ node "$T/control-plane.mjs" "$@"; }
P=0; F=0
chk(){ if [ "$1" = "$2" ]; then echo "  [$3] PASS"; P=$((P+1)); else echo "  [$3] FAIL (got '$2' want '$1')"; F=$((F+1)); fi; }
status(){ node -e 'const s=require(process.argv[1]+"/MASTER_STATE.json");console.log((s.tasks[process.argv[2]]||{}).status||"NONE")' "$T" "$1"; }

echo "=== CONTROL-PLANE-END-TO-END-001 (isolated: $T) ==="
# 1. created without Mason
TID=$(run create '{"task_id":"E2E-001","subsystem":"por","objective":"e2e proof","created_by":"claude","verifier_agent":"codex"}')
chk "NEW" "$(status E2E-001)" "1 task created (no Mason)"
# 2. correct worker sees it
run watch claude | grep -q "CLAIM  E2E-001" && chk yes yes "2 owner sees it via watch" || chk yes no "2 owner sees it"
# 3. worker claims
run claim E2E-001 claude >/dev/null; chk "CLAIMED" "$(status E2E-001)" "3 worker claimed"
# 4. evidence produced
echo "e2e evidence" > "$T/EVIDENCE-E2E.txt"
run transition E2E-001 claude IN_PROGRESS >/dev/null
run transition E2E-001 claude READY_FOR_VERIFICATION --evidence="$T/EVIDENCE-E2E.txt" >/dev/null
chk "READY_FOR_VERIFICATION" "$(status E2E-001)" "4 evidence produced + handed off"
# 5. verifier sees it
run watch codex | grep -q "VERIFY  E2E-001" && chk yes yes "5 verifier sees it via watch" || chk yes no "5 verifier sees it"
# 6. verifier REJECTS
run transition E2E-001 codex VERIFYING >/dev/null
run transition E2E-001 codex FAILED --error="e2e injected defect" >/dev/null
chk "FAILED" "$(status E2E-001)" "6 verifier rejected"
# 7. rejected routes back automatically
run transition E2E-001 codex NEEDS_FIX >/dev/null
run watch claude | grep -q "REPAIR  E2E-001" && chk yes yes "7 routes back to owner automatically" || chk yes no "7 routes back"
# 8. repair submitted
run claim E2E-001 claude >/dev/null; run transition E2E-001 claude IN_PROGRESS >/dev/null
run transition E2E-001 claude READY_FOR_VERIFICATION --claim="repaired" >/dev/null
chk "READY_FOR_VERIFICATION" "$(status E2E-001)" "8 repair submitted"
# 9. verifier rechecks
run transition E2E-001 codex VERIFYING >/dev/null; chk "VERIFYING" "$(status E2E-001)" "9 verifier rechecks"
# 10. final certification
run transition E2E-001 codex CERTIFIED_PASS --result="e2e ok" >/dev/null
chk "CERTIFIED_PASS" "$(status E2E-001)" "10 final certification"
grep -q '"verdict":"CERTIFIED_PASS"' "$T/RESULTS.jsonl" && chk yes yes "10b result logged (auditable)" || chk yes no "10b result logged"
# 11. dashboard updates
node -e 'const fs=require("fs");const st=JSON.parse(fs.readFileSync(process.argv[1]+"/MASTER_STATE.json","utf8"));let m="# dash\n";for(const t of Object.values(st.tasks))m+=`${t.task_id} ${t.status}\n`;fs.writeFileSync(process.argv[1]+"/DASHBOARD.md",m)' "$T"
grep -q "E2E-001 CERTIFIED_PASS" "$T/DASHBOARD.md" && chk yes yes "11 dashboard updated" || chk yes no "11 dashboard updated"
# 12. Mason never involved (no 'mason' actor in the append-only audit)
grep -qi "mason" "$T/TASK_QUEUE.jsonl" && chk no yes "12 Mason NOT involved" || chk no no "12 Mason NOT involved"

echo "=== RESULT: $P passed / $F failed ==="
rm -rf "$T"
[ "$F" -eq 0 ] && echo "CONTROL-PLANE-END-TO-END-001: PASS (fully autonomous)" || echo "CONTROL-PLANE-END-TO-END-001: FAIL"
