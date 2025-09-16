#!/bin/bash
set -e

echo "Building guest server..."

# Variables
export GOOS=windows
export GOARCH=amd64
export PACKAGE=winboat-server
export VERSION="$(node -p "require('./package.json').version")"
export COMMIT_HASH="$(git rev-parse --short HEAD)"
export BUILD_TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S')
export LDFLAGS=(
  "-X 'main.Version=${VERSION}'"
  "-X 'main.CommitHash=${COMMIT_HASH}'"
  "-X 'main.BuildTimestamp=${BUILD_TIMESTAMP}'"
)

echo "Version: ${VERSION}"
echo "Commit Hash: ${COMMIT_HASH}"
echo "Build Timestamp: ${BUILD_TIMESTAMP}"

# Enter build directory
cd guest_server

# Verify nssm.exe integrity
echo "Verifying nssm.exe integrity..."
if [ -f "nssm.exe" ] && [ -f "nssm.sha1.txt" ]; then
    COMPUTED_HASH=$(sha1sum nssm.exe | cut -d' ' -f1)
    EXPECTED_HASH=$(cat nssm.sha1.txt | tr -d '[:space:]')
    
    if [ "$COMPUTED_HASH" = "$EXPECTED_HASH" ]; then
        echo "✓ nssm.exe integrity verified (SHA-1: $COMPUTED_HASH)"
    else
        echo "✗ nssm.exe integrity check FAILED!"
        echo "  Expected: $EXPECTED_HASH"
        echo "  Computed: $COMPUTED_HASH"
        exit 1
    fi
else
    echo "⚠ Warning: nssm.exe or nssm.sha1.txt not found, skipping integrity check"
fi

# Build the guest server
go build -ldflags="${LDFLAGS[*]}" -o winboat_guest_server.exe *.go
rm -f winboat_guest_server.zip
zip -r winboat_guest_server.zip .

echo "Guest server built: guest_server/winboat_guest_server.zip"