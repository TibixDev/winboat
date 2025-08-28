#!/bin/bash
set -e

echo "Building guest server..."

export GOOS=windows
export GOARCH=amd64
export PACKAGE=winboat-server
export VERSION=$(node -p "require('./package.json').version")
export COMMIT_HASH="$(git rev-parse --short HEAD)"
export BUILD_TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S')
export LDFLAGS=(
  "-X 'main.Version=${VERSION}'"
  "-X 'main.CommitHash=${COMMIT_HASH}'"
  "-X 'main.BuildTimestamp=${BUILD_TIMESTAMP}'"
)

cd guest_server
go build -ldflags="${LDFLAGS[*]}" -o winboat_guest_server.exe main.go
rm -f winboat_guest_server.zip
zip -r winboat_guest_server.zip .

echo "Guest server built: guest_server/winboat_guest_server.zip"