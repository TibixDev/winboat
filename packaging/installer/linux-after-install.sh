#!/bin/sh
# Post-install hook for .deb / .rpm WinBoat packages.
#
# Installs the AppArmor profile that allows Chromium's user-namespace sandbox
# on Ubuntu 23.10+ / 24.04+ / Zorin OS 18 / derivatives where
# `kernel.apparmor_restrict_unprivileged_userns = 1` is set by default.
#
# Failure to install the profile is non-fatal: WinBoat will detect the absence
# at runtime and fall back to `--disable-gpu-sandbox` with a console warning.
#
# See src/main/main.ts:isWinboatAppArmorProfileLoaded for the runtime probe.

set -eu

PROFILE_SRC="/opt/WinBoat/resources/apparmor/winboat"
PROFILE_DST="/etc/apparmor.d/winboat"

# Only proceed when AppArmor is actually present on the host.
if ! command -v apparmor_parser >/dev/null 2>&1; then
    exit 0
fi

if [ ! -f "$PROFILE_SRC" ]; then
    # The profile may not have been bundled (e.g. an older build).
    exit 0
fi

# Install (or refresh) the profile.
install -m 0644 "$PROFILE_SRC" "$PROFILE_DST"

# Load it into the running kernel. Best-effort: on systems where AppArmor
# is installed but not active, this exits non-zero \u2014 we swallow that.
apparmor_parser -r "$PROFILE_DST" >/dev/null 2>&1 || true

exit 0
