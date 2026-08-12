#!/usr/bin/env bash
# Install the Codex verifier worker as launchd agents.
#
#   ./install.sh          install + load
#   ./install.sh --status  show state
#   ./install.sh --uninstall
#
# Three agents:
#   com.partyperfect.codex.dispatch  WatchPaths on MASTER_STATE.json -> event-driven.
#                                    launchd fires ONLY when the file changes.
#                                    No polling, no idle model calls.
#   com.partyperfect.codex.daily     06:30 consistency sweep (deterministic).
#   com.partyperfect.codex.weekly    Monday 06:45 deeper audit (deterministic).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
HANDOFF="$(dirname "$HERE")"
STATE_FILE="$HANDOFF/MASTER_STATE.json"
LOG_DIR="$HERE/.logs"
AGENTS="$HOME/Library/LaunchAgents"
NODE="$(command -v node || echo /opt/homebrew/bin/node)"

DISPATCH_LABEL="com.partyperfect.codex.dispatch"
DAILY_LABEL="com.partyperfect.codex.daily"
WEEKLY_LABEL="com.partyperfect.codex.weekly"

usage_status() {
  echo "launchd agents:"
  # launchctl print is authoritative; "list | grep" races right after bootstrap
  # and reports a loaded agent as missing.
  for L in "$DISPATCH_LABEL" "$DAILY_LABEL" "$WEEKLY_LABEL"; do
    if launchctl print "gui/$UID/$L" >/dev/null 2>&1; then
      echo "  LOADED   $L"
    else
      echo "  missing  $L"
    fi
  done
  echo
  echo "codex CLI: $(command -v codex >/dev/null 2>&1 && codex --version 2>/dev/null || echo 'NOT INSTALLED — verifications will BLOCK, never fake-pass')"
  echo "logs: $LOG_DIR"
}

uninstall() {
  for L in "$DISPATCH_LABEL" "$DAILY_LABEL" "$WEEKLY_LABEL"; do
    launchctl bootout "gui/$UID/$L" 2>/dev/null || true
    rm -f "$AGENTS/$L.plist"
    echo "removed $L"
  done
}

case "${1:-}" in
  --status) usage_status; exit 0 ;;
  --uninstall) uninstall; exit 0 ;;
esac

mkdir -p "$LOG_DIR" "$AGENTS"

write_plist() {
  local label="$1"; shift
  local plist="$AGENTS/$label.plist"
  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
$(for a in "$@"; do echo "    <string>$a</string>"; done)
  </array>
  <key>WorkingDirectory</key><string>$HANDOFF</string>
  <key>StandardOutPath</key><string>$LOG_DIR/$label.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/$label.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
PLIST
}

close_plist() { echo "</dict>
</plist>" >> "$AGENTS/$1.plist"; }

# --- dispatcher: fires on MASTER_STATE.json change (event-driven) ---
write_plist "$DISPATCH_LABEL" "$NODE" "$HERE/dispatch.mjs"
cat >> "$AGENTS/$DISPATCH_LABEL.plist" <<PLIST
  <key>WatchPaths</key>
  <array><string>$STATE_FILE</string></array>
  <key>ThrottleInterval</key><integer>30</integer>
PLIST
close_plist "$DISPATCH_LABEL"

# --- daily sweep 06:30 ---
write_plist "$DAILY_LABEL" "$NODE" "$HERE/sweep.mjs" "daily"
cat >> "$AGENTS/$DAILY_LABEL.plist" <<PLIST
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>30</integer></dict>
PLIST
close_plist "$DAILY_LABEL"

# --- weekly audit Monday 06:45 ---
write_plist "$WEEKLY_LABEL" "$NODE" "$HERE/sweep.mjs" "weekly"
cat >> "$AGENTS/$WEEKLY_LABEL.plist" <<PLIST
  <key>StartCalendarInterval</key>
  <dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>6</integer><key>Minute</key><integer>45</integer></dict>
PLIST
close_plist "$WEEKLY_LABEL"

for L in "$DISPATCH_LABEL" "$DAILY_LABEL" "$WEEKLY_LABEL"; do
  plutil -lint "$AGENTS/$L.plist" >/dev/null
  launchctl bootout "gui/$UID/$L" 2>/dev/null || true
  launchctl bootstrap "gui/$UID" "$AGENTS/$L.plist"
  echo "loaded $L"
done

echo
usage_status
