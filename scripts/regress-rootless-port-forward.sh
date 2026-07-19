#!/usr/bin/env bash
# Regression: host published ports vs container→guest for rootless Podman.
# Expectation without userspace forwarder: host ECONNRESET / fail.
# With forwarder: host /health 200 and RDP X.224 response.
#
# SAFETY: first argument MUST be exactly --confirm-live-disruption or this script
# exits before killing any forwarder. Default unattended runs are therefore safe.
set -euo pipefail

if [[ "${1:-}" != "--confirm-live-disruption" ]]; then
  echo "Refusing to run: first argument must be exactly --confirm-live-disruption" >&2
  echo "This script pkill's guest-port-forward / winboat-tcp-forward inside the container." >&2
  echo "Usage: $0 --confirm-live-disruption [containerName]" >&2
  exit 2
fi
shift

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
CONTAINER="${1:-WinBoat}"
GUEST_IP="${GUEST_IP:-172.30.0.2}"
HOST_API="${HOST_API:-127.0.0.1:47271}"
HOST_RDP_HOST="${HOST_RDP_HOST:-127.0.0.1}"
HOST_RDP_PORT="${HOST_RDP_PORT:-47273}"
DISRUPTED=0

restore_forwarders() {
  if [[ "$DISRUPTED" -ne 1 ]]; then
    return
  fi
  DISRUPTED=0
  echo "Restoring guest port forwarders after interrupted regression..." >&2
  bun scripts/ensure-rootless-forwards.ts "$CONTAINER" --replace >&2 || true
}
trap restore_forwarders EXIT INT TERM

probe_host_health() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://${HOST_API}/health" || echo 000
}

probe_guest_health() {
  podman exec "$CONTAINER" curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://${GUEST_IP}:7148/health" || echo 000
}

probe_host_rdp() {
  python3 - <<PY
import socket
pkt=bytes.fromhex('030000130ee00000000000010008000b000000')
s=socket.socket(); s.settimeout(3)
try:
  s.connect(("${HOST_RDP_HOST}", int("${HOST_RDP_PORT}")))
  s.sendall(pkt)
  try:
    d=s.recv(64)
    print(d.hex() if d else "empty")
  except ConnectionResetError:
    print("ECONNRESET")
  except socket.timeout:
    print("timeout")
finally:
  s.close()
PY
}

echo "== baseline guest (must stay healthy) =="
gh=$(probe_guest_health)
echo "guest_health=$gh"
test "$gh" = "200"

echo "== stop userspace forwarders (reproduce host failure) =="
DISRUPTED=1
podman exec "$CONTAINER" sh -c 'pkill -f guest-port-forward || true; pkill -f winboat-tcp-forward || true; sleep 1; ps aux | grep -E "forward" | grep -v grep || echo none'

echo "== host should fail without forwarder =="
hh=$(probe_host_health)
echo "host_health=$hh"
rdp=$(probe_host_rdp)
echo "host_rdp=$rdp"
if [ "$hh" = "200" ]; then
  echo "UNEXPECTED: host health still 200 without forwarder (DNAT may work in this runtime)"
  # still not a hard fail for rootful
else
  echo "REPRODUCED host health failure: $hh"
fi
guest2=$(probe_guest_health)
echo "guest_health_after_kill=$guest2"
test "$guest2" = "200"

echo "== restore forwarders via product ensure script =="
bun scripts/ensure-rootless-forwards.ts "$CONTAINER" --replace
sleep 1
restored_health=$(probe_host_health)
restored_rdp=$(probe_host_rdp)
echo "restored_host_health=$restored_health"
echo "restored_host_rdp=$restored_rdp"
test "$restored_health" = "200"
case "$restored_rdp" in
  ""|empty|ECONNRESET|timeout) exit 1 ;;
esac
DISRUPTED=0
