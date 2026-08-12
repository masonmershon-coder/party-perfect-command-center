#!/usr/bin/env bash
# Install the Cursor dispatcher as a launchd agent.
#
#   ./install.sh   ./install.sh --status   ./install.sh --uninstall
#
# WatchPaths on MASTER_STATE.json: launchd fires ONLY when the control plane
# changes. No polling, no idle model calls. The dispatcher itself is
# deterministic and exits immediately when nothing is actionable.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
HANDOFF="$(dirname "$HERE")"
STATE_FILE="$HANDOFF/MASTER_STATE.json"
LOG_DIR="$HERE/.logs"
AGENTS="$HOME/Library/LaunchAgents"
NODE="$(command -v node || echo /opt/homebrew/bin/node)"
LABEL="com.partyperfect.cursor.dispatch"
PLIST="$AGENTS/$LABEL.plist"

show_status() {
  if launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1; then
    echo "  LOADED   $LABEL"
  else
    echo "  missing  $LABEL"
  fi
  printf "  cursor-agent: "
  command -v cursor-agent >/dev/null 2>&1 && cursor-agent --version 2>/dev/null \
    || echo "NOT INSTALLED — Cursor tasks stay parked, never fake-executed"
  echo "  logs: $LOG_DIR"
}

case "${1:-}" in
  --status) show_status; exit 0 ;;
  --uninstall)
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"; echo "removed $LABEL"; exit 0 ;;
esac

mkdir -p "$LOG_DIR" "$AGENTS"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$HERE/dispatch.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$HANDOFF</string>
  <key>StandardOutPath</key><string>$LOG_DIR/$LABEL.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/$LABEL.err.log</string>
  <key>WatchPaths</key>
  <array><string>$STATE_FILE</string></array>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PLIST

plutil -lint "$PLIST" >/dev/null
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
echo "loaded $LABEL"
echo
show_status
