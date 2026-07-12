#!/bin/sh
# Post-install hook for .deb / .rpm WinBoat packages.
#
# Two things happen here, both best-effort:
#
#   1. Install the AppArmor profile that allows Chromium's user-namespace
#      sandbox on Ubuntu 23.10+ / 24.04+ / Zorin OS 18 / derivatives where
#      `kernel.apparmor_restrict_unprivileged_userns = 1` is set by default.
#      Failure is non-fatal: WinBoat will detect the absence at runtime and
#      fall back to `--disable-gpu-sandbox` with a console warning.
#      See src/main/main.ts:isWinboatAppArmorProfileLoaded for the runtime probe.
#
#   2. Install the polkit policy for GPU passthrough
#      (org.winboat.gpu-passthrough.manage/.status) and make the helper
#      binary executable. Failure here only disables the GPU passthrough
#      feature — the rest of WinBoat keeps working.

set -eu

# ---------------------------------------------------------------------------
# AppArmor profile
# ---------------------------------------------------------------------------
APPARMOR_SRC="/opt/WinBoat/resources/apparmor/winboat"
APPARMOR_DST="/etc/apparmor.d/winboat"

if command -v apparmor_parser >/dev/null 2>&1 && [ -f "$APPARMOR_SRC" ]; then
    install -m 0644 "$APPARMOR_SRC" "$APPARMOR_DST"
    # Load it into the running kernel. Best-effort: on systems where AppArmor
    # is installed but not active, this exits non-zero — we swallow that.
    apparmor_parser -r "$APPARMOR_DST" >/dev/null 2>&1 || true
fi

# ---------------------------------------------------------------------------
# polkit policy + helper
# ---------------------------------------------------------------------------
POLKIT_SRC="/opt/WinBoat/resources/polkit/org.winboat.gpu-passthrough.policy"
POLKIT_DST="/usr/share/polkit-1/actions/org.winboat.gpu-passthrough.policy"
HELPER_BIN="/opt/WinBoat/resources/winboat-gpu-helper"

if [ -f "$POLKIT_SRC" ] && [ -d "/usr/share/polkit-1/actions" ]; then
    install -m 0644 "$POLKIT_SRC" "$POLKIT_DST"
fi

# Chmod the helper. electron-builder doesn't reliably preserve the +x bit on
# extraResources, so we apply it ourselves. Owned by root:root, exec for all
# (pkexec sets EUID; the helper itself does input validation).
if [ -f "$HELPER_BIN" ]; then
    chmod 0755 "$HELPER_BIN" || true
fi

exit 0
