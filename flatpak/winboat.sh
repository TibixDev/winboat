#!/bin/sh
set -eu
export TMPDIR="${XDG_RUNTIME_DIR:-/tmp}/app.${FLATPAK_ID:-app.winboat.WinBoat}"
mkdir -p "${TMPDIR}"
# Electron's setuid chrome-sandbox cannot be root-owned inside Flatpak; rely on Flatpak's sandbox instead.
SANDBOX_FLAGS="--no-sandbox --disable-setuid-sandbox"
if [ -x /app/winboat/winboat ]; then exec /app/winboat/winboat ${SANDBOX_FLAGS} "$@"; fi
if [ -x /app/winboat/WinBoat ]; then exec /app/winboat/WinBoat ${SANDBOX_FLAGS} "$@"; fi
echo "WinBoat executable not found under /app/winboat" >&2
exit 1
