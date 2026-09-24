#!/usr/bin/env bash
# Install Matter Core Alpha as a user LaunchAgent. Safe: no sudo, no production deploy.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
LABEL="app.kituwa.matter-core-alpha"
AGENTS="$HOME/Library/LaunchAgents"; PLIST="$AGENTS/$LABEL.plist"
NODE="$(command -v node || true)"
: "${NODE:?node is required}"
: "${MATTER_DATA_ROOT:?Set MATTER_DATA_ROOT to the real mounted Matter working-data directory. This installer will not guess it.}"
mkdir -p "$MATTER_DATA_ROOT/logs" "$AGENTS"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$LABEL</string>
<key>ProgramArguments</key><array><string>$NODE</string><string>$HERE/core-alpha.mjs</string></array>
<key>WorkingDirectory</key><string>$HERE</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>15</integer>
<key>EnvironmentVariables</key><dict>
 <key>MATTER_DATA_ROOT</key><string>$MATTER_DATA_ROOT</string>
 <key>PATH</key><string>$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
</dict>
<key>StandardOutPath</key><string>$MATTER_DATA_ROOT/logs/core.out.log</string>
<key>StandardErrorPath</key><string>$MATTER_DATA_ROOT/logs/core.err.log</string>
</dict></plist>
PLIST
plutil -lint "$PLIST"
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
launchctl kickstart -k "gui/$UID/$LABEL"
echo "Matter Core Alpha installed. Health: $MATTER_DATA_ROOT/CORE_HEALTH.json"
