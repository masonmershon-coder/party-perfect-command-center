#!/usr/bin/env bash
# Mac-side replication ingester as a launchd agent.
#   ./install-mac-ingester.sh   [--status|--uninstall]
#
# Deterministic and read-only with respect to POR: it only verifies and promotes
# batches ENTERPRISE already wrote. No model is invoked, so it is outside the
# paid-compute governor.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
AGENTS="$HOME/Library/LaunchAgents"; LABEL="com.partyperfect.por.ingest"
PLIST="$AGENTS/$LABEL.plist"; NODE="$(command -v node || echo /opt/homebrew/bin/node)"
LOG="$HERE/.logs"; SHARE="/Volumes/PPL Storage/POR-REPLICATION/batches"

case "${1:-}" in
  --status) launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1 && echo "  LOADED  $LABEL" || echo "  missing $LABEL"
            node "$HERE/ingest-batches.mjs" --status; exit 0 ;;
  --uninstall) launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true; rm -f "$PLIST"; echo "removed $LABEL"; exit 0 ;;
esac

mkdir -p "$LOG" "$AGENTS"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string><string>$HERE/ingest-batches.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$HERE</string>
  <key>StandardOutPath</key><string>$LOG/ingest.out.log</string>
  <key>StandardErrorPath</key><string>$LOG/ingest.err.log</string>
  <key>WatchPaths</key><array><string>$SHARE</string></array>
  <key>StartInterval</key><integer>900</integer>
  <key>ThrottleInterval</key><integer>60</integer>
</dict></plist>
PLIST
plutil -lint "$PLIST" >/dev/null
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
echo "loaded $LABEL (WatchPaths on the share + 15-min safety poll)"
