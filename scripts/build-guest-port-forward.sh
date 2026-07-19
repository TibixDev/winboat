#!/usr/bin/env bash
# Build guest-port-forward for linux/arm64 and linux/amd64 into tools/guest-port-forward/dist.
# Does NOT auto-copy into $HOME / WINBOAT_DIR (that created stale binaries preferred over
# packaged extraResources). Runtime resolution order is: packaged resources > dist > legacy data dir.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/tools/guest-port-forward/dist"
SRC="$ROOT/tools/guest-port-forward"
mkdir -p "$OUT"

if ! command -v go >/dev/null 2>&1; then
  echo "go not found in PATH; cannot build guest-port-forward" >&2
  exit 1
fi

build_one() {
  local goarch="$1"
  local out="$OUT/guest-port-forward-linux-${goarch}"
  echo "building $out"
  (cd "$SRC" && CGO_ENABLED=0 GOOS=linux GOARCH="$goarch" go build -trimpath -ldflags="-s -w" -o "$out" .)
  chmod +x "$out"
}

build_one arm64
build_one amd64

echo "built guest-port-forward binaries (no HOME/XDG auto-copy):"
ls -la "$OUT"
