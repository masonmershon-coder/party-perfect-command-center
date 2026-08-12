#!/usr/bin/env bash
if [[ "${1:-}" == "--version" ]]; then echo "stub-codex 0.0.0"; exit 0; fi
if [[ -f "/Users/mikeai/grok-dashboard/AI-HANDOFF/EVIDENCE/CONTROL-PLANE-CURSOR-SMOKE-001-artifact.md" ]]; then
  echo '{"verdict":"CERTIFIED_PASS","summary":"required evidence artifact present; tests recorded","findings":[],"checked":["artifact exists","evidence file written"]}'
else
  echo '{"verdict":"NEEDS_FIX","summary":"required evidence artifact is missing","findings":[{"severity":"P1","code":"missing-evidence-artifact","summary":"Cursor did not produce the required artifact","evidence":"AI-HANDOFF/EVIDENCE/"}],"checked":["artifact existence"]}'
fi
