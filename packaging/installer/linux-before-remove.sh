#!/bin/sh
# Pre-remove hook for .deb / .rpm WinBoat packages.
#
# Unloads the AppArmor profile and removes the polkit policy + AppArmor file.
# Failure is non-fatal so package removal always succeeds.

set -eu

APPARMOR_DST="/etc/apparmor.d/winboat"
POLKIT_DST="/usr/share/polkit-1/actions/org.winboat.gpu-passthrough.policy"

if [ -f "$APPARMOR_DST" ] && command -v apparmor_parser >/dev/null 2>&1; then
    apparmor_parser -R "$APPARMOR_DST" >/dev/null 2>&1 || true
fi
rm -f "$APPARMOR_DST" || true

rm -f "$POLKIT_DST" || true

exit 0
