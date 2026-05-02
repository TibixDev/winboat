#!/bin/sh
set -eu
export TMPDIR="${XDG_RUNTIME_DIR:-/tmp}/app.${FLATPAK_ID:-app.winboat.WinBoat}"
mkdir -p "${TMPDIR}"
if [ -x /app/winboat/winboat ]; then exec /app/winboat/winboat "${@}"; fi
if [ -x /app/winboat/WinBoat ]; then exec /app/winboat/WinBoat "${@}"; fi
echo "WinBoat executable not found under /app/winboat" >&2
exit 1
