#!/bin/sh -e

source "$(dirname "$0")/common-script.sh"

if [ -f /etc/apparmor.d/local/usr.sbin.smbd ]; then
    "$ESCALATION_TOOL" tee /etc/apparmor.d/local/usr.sbin.smbd << 'EOF'
/shared/ lrwk,
/shared/** lrwk,
EOF
fi