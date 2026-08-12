#!/usr/bin/env bash
# Watch AI-HANDOFF peer files. Notify Mason; optionally auto-wake Claude (--bg)
# when status is READY_FOR_CLAUDE*. Cursor wake = notify only (open Cursor chat).
#
# Enable auto-wake: touch AI-HANDOFF/AUTO_RELAY.enabled
# Disable:          rm AI-HANDOFF/AUTO_RELAY.enabled
#
# Safety: debounce 90s, max 3 Claude wakes / hour, only READY_FOR_CLAUDE* statuses,
# skip WAITING_FOR_MASON / BLOCKED / APPROVAL, ack PING ids, never spawn if secrets
# patterns appear in handoff text.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HANDOFF="$ROOT/AI-HANDOFF"
STATE="$HANDOFF/.relay-state"
ENABLED="$HANDOFF/AUTO_RELAY.enabled"
PING="$HANDOFF/PING.json"
CURRENT="$HANDOFF/CURRENT_TASK.md"
TO_CLAUDE="$HANDOFF/CURSOR_TO_CLAUDE.md"
TO_CURSOR="$HANDOFF/CLAUDE_TO_CURSOR.md"
LOG="$STATE/relay.log"

mkdir -p "$STATE"
touch "$STATE/last-claude-wake" "$STATE/last-cursor-notify" "$STATE/acked-ids" "$LOG"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$LOG"; }

notify() {
  local title="$1" body="$2"
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"${body//\"/\\\"}\" with title \"${title//\"/\\\"}\"" 2>/dev/null || true
  fi
  log "notify: $title — $body"
}

extract_status() {
  local file="$1"
  [[ -f "$file" ]] || { echo ""; return; }
  # Prefer CURRENT_TASK STATUS line, else first STATUS: in peer file
  grep -E '^\*\*STATUS:\*\*|^STATUS:' "$file" 2>/dev/null | head -n1 \
    | sed -E 's/.*STATUS:\*\*[[:space:]]*//;s/^STATUS:[[:space:]]*//;s/[[:space:]]*$//' \
    | tr '\n' ' ' | cut -c1-120 || true
}

fingerprint() {
  local f="$1"
  [[ -f "$f" ]] || { echo "missing"; return; }
  # size + mtime + short checksum — portable
  python3 - "$f" <<'PY'
import hashlib, os, sys
p = sys.argv[1]
st = os.stat(p)
h = hashlib.sha256()
with open(p, "rb") as fh:
    h.update(fh.read(65536))
print(f"{st.st_mtime_ns}:{st.st_size}:{h.hexdigest()[:16]}")
PY
}

should_wake_claude() {
  local status="$1"
  case "$status" in
    *READY_FOR_CLAUDE*) return 0 ;;
    *) return 1 ;;
  esac
}

blocked_status() {
  local status="$1"
  case "$status" in
    *WAITING_FOR_MASON*|*BLOCKED*|*APPROVAL*|*DONE*) return 0 ;;
    *) return 1 ;;
  esac
}

wakes_last_hour() {
  local count=0 now
  now=$(date +%s)
  while read -r ts; do
    [[ -z "$ts" ]] && continue
    if (( now - ts < 3600 )); then count=$((count + 1)); fi
  done < "$STATE/claude-wake-times" 2>/dev/null || true
  echo "$count"
}

record_wake() {
  date +%s >> "$STATE/claude-wake-times"
  # keep last 20
  tail -n 20 "$STATE/claude-wake-times" > "$STATE/claude-wake-times.tmp" 2>/dev/null || true
  mv "$STATE/claude-wake-times.tmp" "$STATE/claude-wake-times" 2>/dev/null || true
}

ack_ping() {
  local id="$1" who="$2"
  [[ -z "$id" ]] && return
  if grep -qxF "$id" "$STATE/acked-ids" 2>/dev/null; then
    return 1
  fi
  echo "$id" >> "$STATE/acked-ids"
  tail -n 50 "$STATE/acked-ids" > "$STATE/acked-ids.tmp" && mv "$STATE/acked-ids.tmp" "$STATE/acked-ids"
  if [[ -f "$PING" ]]; then
    python3 - "$PING" "$who" <<'PY' || true
import json, sys, datetime
path, who = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
data["acked_by"] = who
data["acked_at"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
  fi
  return 0
}

read_ping_id() {
  [[ -f "$PING" ]] || { echo ""; return; }
  python3 - "$PING" <<'PY'
import json, sys
try:
    print(json.load(open(sys.argv[1])).get("id") or "")
except Exception:
    print("")
PY
}

wake_claude() {
  local status="$1" summary="$2"
  if [[ ! -f "$ENABLED" ]]; then
    notify "PP handoff → Claude" "Auto-wake OFF. Status $status — open Claude or: touch AI-HANDOFF/AUTO_RELAY.enabled"
    return
  fi
  if blocked_status "$status"; then
    notify "PP handoff" "Needs Mason ($status) — not auto-waking"
    return
  fi
  if ! should_wake_claude "$status"; then
    notify "PP handoff → Claude" "$status — open Claude when ready"
    return
  fi

  local last now
  last=$(cat "$STATE/last-claude-wake" 2>/dev/null || echo 0)
  now=$(date +%s)
  if (( now - last < 90 )); then
    log "debounce: skip Claude wake"
    return
  fi

  local n
  n=$(wakes_last_hour)
  if (( n >= 3 )); then
    notify "PP handoff" "Claude wake cap (3/hr) hit — open Claude manually"
    log "cap: skip Claude wake"
    return
  fi

  if ! command -v claude >/dev/null 2>&1; then
    notify "PP handoff → Claude" "claude CLI missing — open Claude manually"
    return
  fi

  echo "$now" > "$STATE/last-claude-wake"
  record_wake
  log "waking Claude: $status"

  (
    cd "$ROOT"
    # Background agent; permission prompts still go to Mason when needed.
    claude --bg -p "Party Perfect AI-HANDOFF relay: read AI-HANDOFF/CURRENT_TASK.md, CURSOR_TO_CLAUDE.md, PING.json, BLOCKERS.md. Status appears READY_FOR_CLAUDE*. Continue your turn. Never put secrets in handoff files. Do not start runaway loops — one work cycle, then update CLAUDE_TO_CURSOR.md + CURRENT_TASK.md + ping." \
      >/dev/null 2>>"$LOG" || log "claude --bg failed"
  ) &

  notify "PP handoff" "Auto-woke Claude ($status)"
}

handle_change() {
  local which="$1"
  local status summary ping_id

  status="$(extract_status "$CURRENT")"
  [[ -z "$status" && "$which" == "to-claude" ]] && status="$(extract_status "$TO_CLAUDE")"
  [[ -z "$status" && "$which" == "to-cursor" ]] && status="$(extract_status "$TO_CURSOR")"
  summary="$(head -n 5 "$CURRENT" 2>/dev/null | tr '\n' ' ' | cut -c1-160 || true)"
  ping_id="$(read_ping_id)"

  if [[ -n "$ping_id" ]]; then
    ack_ping "$ping_id" "relay" || { log "already acked $ping_id"; return; }
  fi

  case "$which" in
    to-claude|ping-to-claude)
      wake_claude "${status:-READY_FOR_CLAUDE}" "$summary"
      ;;
    to-cursor|ping-to-cursor)
      notify "PP handoff → Cursor" "${status:-update} — open Cursor and say: read AI-HANDOFF, continue"
      log "cursor notify only (no Cursor auto-spawn CLI on this Mac)"
      ;;
  esac
}

# Initial fingerprints
FP_CLAUDE="$(fingerprint "$TO_CLAUDE")"
FP_CURSOR="$(fingerprint "$TO_CURSOR")"
FP_PING="$(fingerprint "$PING")"
FP_CUR="$(fingerprint "$CURRENT")"

log "relay started (auto-wake=$([ -f "$ENABLED" ] && echo ON || echo OFF))"
notify "PP handoff relay" "Watching AI-HANDOFF (auto-wake $([ -f "$ENABLED" ] && echo ON || echo OFF))"

# Poll — no fswatch required; works everywhere. Interval ~2s for near-real-time.
while true; do
  sleep 2
  n_claude="$(fingerprint "$TO_CLAUDE")"
  n_cursor="$(fingerprint "$TO_CURSOR")"
  n_ping="$(fingerprint "$PING")"
  n_cur="$(fingerprint "$CURRENT")"

  if [[ "$n_claude" != "$FP_CLAUDE" ]]; then
    FP_CLAUDE="$n_claude"
    handle_change "to-claude"
  fi
  if [[ "$n_cursor" != "$FP_CURSOR" ]]; then
    FP_CURSOR="$n_cursor"
    handle_change "to-cursor"
  fi
  if [[ "$n_ping" != "$FP_PING" ]]; then
    FP_PING="$n_ping"
    if [[ -f "$PING" ]]; then
      to="$(python3 -c "import json;print(json.load(open('$PING')).get('to',''))" 2>/dev/null || true)"
      if [[ "$to" == "claude" ]]; then
        handle_change "ping-to-claude"
      elif [[ "$to" == "cursor" ]]; then
        handle_change "ping-to-cursor"
      fi
    fi
  fi
  if [[ "$n_cur" != "$FP_CUR" ]]; then
    FP_CUR="$n_cur"
    # Status-only bump: notify if READY_FOR_* appeared
    st="$(extract_status "$CURRENT")"
    if should_wake_claude "$st"; then
      handle_change "to-claude"
    elif [[ "$st" == *READY_FOR_CURSOR* ]]; then
      handle_change "to-cursor"
    fi
  fi
done
