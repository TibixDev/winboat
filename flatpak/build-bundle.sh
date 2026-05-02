#!/usr/bin/env bash
# Build dist/winboat.flatpak from dist/linux-unpacked.
# Run after: bun run build:linux-dir   (Flatpak-friendly; no rpmbuild)
#            or bun run build:linux-gs (full AppImage/deb/rpm/… — CI installs rpm).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

for cmd in flatpak flatpak-builder; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing '${cmd}'. Install it (e.g. sudo apt install flatpak flatpak-builder) and try again." >&2
    exit 1
  fi
done

if [ ! -d dist/linux-unpacked ]; then
  echo "dist/linux-unpacked not found. Run first:" >&2
  echo "  bun run build:linux-dir    # recommended for Flatpak (no RPM tooling)" >&2
  echo "  bun run build:linux-gs     # full Linux targets (needs rpmbuild for .rpm)" >&2
  exit 1
fi

flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo

BUILD_DIR="${ROOT}/flatpak/.flatpak-build-dir"
REPO_DIR="${ROOT}/flatpak/.flatpak-repo-local"
STATE_DIR="${ROOT}/flatpak/.flatpak-builder-state"
mkdir -p "${BUILD_DIR}" "${REPO_DIR}" "${STATE_DIR}"

MANIFEST="${ROOT}/flatpak/app.winboat.WinBoat.yml"

flatpak-builder --user --disable-rofiles-fuse \
  --state-dir="${STATE_DIR}" \
  --default-branch=stable \
  --install-deps-from=flathub \
  --repo="${REPO_DIR}" \
  --force-clean \
  "${BUILD_DIR}" \
  "${MANIFEST}"

flatpak build-update-repo "${REPO_DIR}" --generate-static-deltas

mkdir -p dist
flatpak build-bundle \
  --runtime-repo=https://flathub.org/repo/flathub.flatpakrepo \
  "${REPO_DIR}" \
  "${ROOT}/dist/winboat.flatpak" \
  app.winboat.WinBoat \
  stable

echo "Built ${ROOT}/dist/winboat.flatpak"
echo "OSTree repo (for Pages / mirrors): ${REPO_DIR}"
echo "Install with: flatpak install --bundle ./dist/winboat.flatpak"
