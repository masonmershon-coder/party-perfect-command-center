#!/bin/bash
# LAUNCHD CONTROL TEST — is automatic scheduling working on this Mac?
#
# Run this AFTER approving the Party Perfect items in:
#   System Settings → General → Login Items & Extensions → "Allow in the Background"
#
# It installs a throwaway three-line job (no Party Perfect code) and checks whether launchd
# fires it on its own. It cleans up after itself. Safe and reversible.
#
#   bash launchd-control-test.sh
#
# PASS  => automatic scheduling works; the watchdog may be armed and supervision installed.
# FAIL  => launchd still will not run jobs unattended; do NOT arm the watchdog, it cannot work.
set -u
LABEL="pp.controltest"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="/tmp/pp-controltest.log"
UID_N="$(id -u)"

cleanup() { launchctl bootout "gui/$UID_N/$LABEL" 2>/dev/null; rm -f "$PLIST" "$LOG"; }
trap cleanup EXIT

rm -f "$LOG"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/sh</string><string>-c</string>
    <string>date -u +%H:%M:%S >> $LOG</string>
  </array>
  <key>StartInterval</key><integer>20</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>
EOF

launchctl bootout "gui/$UID_N/$LABEL" 2>/dev/null
launchctl bootstrap "gui/$UID_N" "$PLIST" 2>/dev/null

echo "control test running (RunAtLoad + 20s interval) — observing for 50s..."
sleep 50
FIRES=$( [ -f "$LOG" ] && wc -l < "$LOG" | tr -d ' ' || echo 0 )
RUNS=$(launchctl print "gui/$UID_N/$LABEL" 2>/dev/null | grep -E '^[[:space:]]*runs =' | tr -dc '0-9')

echo "  fires logged : ${FIRES:-0}"
echo "  launchd runs : ${RUNS:-0}"
echo ""
if [ "${FIRES:-0}" -ge 2 ]; then
  echo "RESULT: PASS — launchd fires jobs automatically."
  echo "  Safe to install supervision and arm the watchdog."
  exit 0
elif [ "${FIRES:-0}" -eq 1 ]; then
  echo "RESULT: PARTIAL — RunAtLoad fired but the repeating interval did not."
  echo "  Do NOT start the soak. Investigate StartInterval/background permission further."
  exit 2
else
  echo "RESULT: FAIL — launchd did not run the job at all (this is the current known state)."
  echo "  Background permission is still missing or the login domain is degraded."
  echo "  Do NOT arm the watchdog: it would never start, tick, or respawn."
  exit 1
fi
