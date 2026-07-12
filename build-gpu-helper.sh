#!/bin/bash
# Build the Linux-only GPU passthrough privileged helper.
#
# The helper is a tiny static Go binary that bridges the unprivileged
# renderer to the kernel's vfio-pci driver. It's only meaningful on
# Linux hosts; on every other platform this script is a no-op so the
# main electron-builder pipeline still completes.
#
# Sources / rationale:
#   - polkit + pkexec model: https://www.freedesktop.org/software/polkit/docs/latest/pkexec.1.html
#   - VFIO driver_override workflow: https://docs.kernel.org/PCI/pci.html
#   - Why -trimpath / -buildvcs=false: reproducible build best practice
#     (cf. https://go.dev/ref/mod#build-commands).

set -e

if [ "$(uname -s)" != "Linux" ]; then
    echo "winboat-gpu-helper is Linux-only; skipping build on $(uname -s)."
    exit 0
fi

echo "Building winboat-gpu-helper..."

export GOOS=linux
export GOARCH="${GOARCH:-amd64}"
export CGO_ENABLED=0      # pure-static binary, no glibc dependency
export PACKAGE=winboat-gpu-helper
export VERSION="$(bun -p "require('./package.json').version" 2>/dev/null || echo dev)"
export COMMIT_HASH="$(git rev-parse --short HEAD 2>/dev/null || echo none)"
export BUILD_TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S')

LDFLAGS=(
    "-s" "-w"                                   # strip debug info
    "-X" "main.helperVersion=${VERSION}+${COMMIT_HASH}"
)

cd gpu_helper

echo "Running go vet + unit tests..."
go vet ./...
go test -count=1 ./...

echo "Compiling static binary (GOOS=${GOOS}, GOARCH=${GOARCH})..."
go build \
    -trimpath \
    -buildvcs=false \
    -ldflags "${LDFLAGS[*]}" \
    -o winboat-gpu-helper \
    .

ls -la winboat-gpu-helper
file winboat-gpu-helper 2>/dev/null || true
echo "winboat-gpu-helper build complete: $(pwd)/winboat-gpu-helper"
