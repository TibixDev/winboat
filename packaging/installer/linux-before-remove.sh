#!/bin/sh
# Pre-remove hook for .deb / .rpm WinBoat packages.
#
# Unloads the AppArmor profile and removes the profile file on uninstall.
# Failure is non-fatal so package removal always succeeds.

set -eu

PROFILE_DST="/etc/apparmor.d/winboat"

if [ -f "$PROFILE_DST" ] && command -v apparmor_parser >/dev/null 2>&1; then
    apparmor_parser -R "$PROFILE_DST" >/dev/null 2>&1 || true
fi

rm -f "$PROFILE_DST" || true

exit 0
