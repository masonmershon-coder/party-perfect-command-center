#!/usr/bin/env bash
# Matter orchestrator as a launchd agent. Survives terminal close, session end,
# and reboot. Matter itself calls no model; it routes and launches role workers,
# each of which is independently gated by the compute governor.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; HANDOFF="$(dirname "$HERE")"
AGENTS="$HOME/Library/LaunchAgents"; LABEL="com.partyperfect.matter"
PLIST="$AGENTS/$LABEL.plist"; NODE="$(command -v node || echo /opt/homebrew/bin/node)"
LOG="$HERE/.logs"
case "${1:-}" in
  --status) launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1 && echo "  LOADED  $LABEL" || echo "  missing $LABEL"; exit 0 ;;
  --uninstall) launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true; rm -f "$PLIST"; echo "removed $LABEL"; exit 0 ;;
esac
mkdir -p "$LOG" "$AGENTS"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string><string>$HERE/orchestrate.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$HANDOFF</string>
  <key>StandardOutPath</key><string>$LOG/matter.out.log</string>
  <key>StandardErrorPath</key><string>$LOG/matter.err.log</string>
  <key>WatchPaths</key><array><string>$HANDOFF/MASTER_STATE.json</string></array>
  <key>StartInterval</key><integer>600</integer>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict></plist>
PLIST
plutil -lint "$PLIST" >/dev/null
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
echo "loaded $LABEL (event-driven on MASTER_STATE + 10-min safety pass)"
