#!/bin/sh
set -eu
export TMPDIR="${XDG_RUNTIME_DIR:-/tmp}/app.${FLATPAK_ID:-app.winboat.WinBoat}"
mkdir -p "${TMPDIR}"
# Trash integration (see https://docs.flatpak.org/en/latest/electron.html#sandbox-permissions)
export ELECTRON_TRASH="${ELECTRON_TRASH:-gio}"
# Electron's setuid chrome-sandbox cannot be root-owned inside Flatpak; rely on Flatpak's sandbox instead.
# --ozone-platform-hint=auto: Wayland when available (experimental; see Flatpak Electron guide).
SANDBOX_FLAGS="--no-sandbox --disable-setuid-sandbox --ozone-platform-hint=auto"
if [ -x /app/winboat/winboat ]; then exec /app/winboat/winboat ${SANDBOX_FLAGS} "$@"; fi
if [ -x /app/winboat/WinBoat ]; then exec /app/winboat/WinBoat ${SANDBOX_FLAGS} "$@"; fi
echo "WinBoat executable not found under /app/winboat" >&2
exit 1
