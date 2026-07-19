#!/usr/bin/env bash
# Safety evidence: unattended runs of disruption scripts must exit before killing forwarders.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail=0
assert_refuses() {
  local script="$1"
  local out ec
  set +e
  out=$(bash "$script" 2>&1)
  ec=$?
  set -e
  if [[ "$ec" -eq 0 ]]; then
    echo "FAIL: $script without flag exited 0" >&2
    fail=1
    return
  fi
  if [[ "$ec" -ne 2 ]]; then
    echo "FAIL: $script expected exit 2, got $ec" >&2
    fail=1
  fi
  if ! grep -q -- '--confirm-live-disruption' <<<"$out"; then
    echo "FAIL: $script stderr missing flag guidance" >&2
    fail=1
  fi
  # Must not have reached kill paths (help text may mention disruption; body markers must not appear)
  if grep -qiE 'stop forwarders via product|stop userspace forwarders|RED_host_health|REPRODUCED host' <<<"$out"; then
    echo "FAIL: $script appears to have run disruption body" >&2
    fail=1
  fi
  echo "OK: $script refuses without --confirm-live-disruption (exit=$ec)"
}

assert_refuses "scripts/step5-live-ab.sh"
assert_refuses "scripts/regress-rootless-port-forward.sh"

# Wrong first arg (not exact flag) also refuses
set +e
out=$(bash scripts/step5-live-ab.sh WinBoat 2>&1)
ec=$?
set -e
if [[ "$ec" -eq 0 ]] || grep -qiE 'stop forwarders via product|RED_host_health' <<<"$out"; then
  echo "FAIL: positional container name alone must not disrupt" >&2
  fail=1
else
  echo "OK: step5-live-ab.sh refuses when first arg is container name"
fi

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi
echo "ALL live-disruption-guard checks passed"
