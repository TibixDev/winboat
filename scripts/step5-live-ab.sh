#!/usr/bin/env bash
# Step5 live A/B without printing secrets or restarting the Windows container.
# RED: stop product forwarders -> host fails while guest stays 200
# GREEN: product ensure --replace -> host /health 200 + RDP X.224
#
# SAFETY: first argument MUST be exactly --confirm-live-disruption or this script
# exits before killing any forwarder. Default unattended runs are therefore safe.
set -euo pipefail

if [[ "${1:-}" != "--confirm-live-disruption" ]]; then
  echo "Refusing to run: first argument must be exactly --confirm-live-disruption" >&2
  echo "This script stops guest-port-forward processes (live host API/RDP will break until restored)." >&2
  echo "Usage: $0 --confirm-live-disruption [containerName] [logPath]" >&2
  exit 2
fi
shift

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
CONTAINER="${1:-WinBoat}"
LOG="${2:-/tmp/step5-ab.log}"
DISRUPTED=0

restore_forwarders() {
  if [[ "$DISRUPTED" -ne 1 ]]; then
    return
  fi
  DISRUPTED=0
  echo "Restoring guest port forwarders after interrupted A/B run..." >&2
  bun scripts/ensure-rootless-forwards.ts "$CONTAINER" --replace >&2 || true
}
trap restore_forwarders EXIT INT TERM

host_health() { curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:47271/health || echo 000; }
guest_health() { podman exec "$CONTAINER" curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://172.30.0.2:7148/health || echo 000; }
host_rdp() {
  python3 - <<'PY'
import socket
pkt=bytes.fromhex('030000130ee00000000000010008000b000000')
s=socket.socket(); s.settimeout(3)
try:
  s.connect(('127.0.0.1',47273)); s.sendall(pkt)
  try:
    d=s.recv(64); print(d.hex() if d else 'empty')
  except ConnectionResetError:
    print('ECONNRESET')
  except socket.timeout:
    print('timeout')
finally:
  s.close()
PY
}

{
  echo "=== RED: stop forwarders via product helper ==="
  DISRUPTED=1
  bun -e '
    import { stopGuestPortForwarders } from "./src/renderer/lib/containers/rootless-port-forward.ts";
    const stopped = await stopGuestPortForwarders(process.argv[1] || "WinBoat", "any");
    console.log(JSON.stringify({stopped}));
  ' "$CONTAINER"
  sleep 1
  echo "RED_host_health=$(host_health)"
  echo "RED_guest_health=$(guest_health)"
  echo "RED_host_rdp=$(host_rdp)"

  echo "=== GREEN: product ensure --replace ==="
  bun scripts/ensure-rootless-forwards.ts "$CONTAINER" --replace
  sleep 1
  green_health=$(host_health)
  green_guest_body=$(curl -s --max-time 3 http://127.0.0.1:47271/health || true)
  green_guest_direct=$(guest_health)
  green_rdp=$(host_rdp)
  green_novnc=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:47270/ || echo 000)
  green_restarts=$(podman inspect "$CONTAINER" --format '{{.RestartCount}}')
  green_forwarders=$(podman exec "$CONTAINER" sh -c "ps -eo args= | awk '\$1==\"/usr/local/bin/guest-port-forward-winboat-gpf-v1\"{n++} END{print n+0}'")
  echo "GREEN_host_health=$green_health"
  echo "GREEN_guest_body=$green_guest_body"
  echo "GREEN_guest_direct=$green_guest_direct"
  echo "GREEN_host_rdp=$green_rdp"
  echo "GREEN_novnc=$green_novnc"
  echo "GREEN_restarts=$green_restarts"
  echo "GREEN_forwarders=$green_forwarders"
  test "$green_health" = "200"
  test "$green_guest_direct" = "200"
  test "$green_restarts" = "0"
  test "$green_forwarders" = "3"
  case "$green_rdp" in
    ""|empty|ECONNRESET|timeout) exit 1 ;;
  esac
  DISRUPTED=0
  podman exec "$CONTAINER" sh -c 'ps -eo args= | awk "/guest-port-forward/{print}"'
} | tee "$LOG"
