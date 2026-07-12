# WinBoat GPU passthrough — real-hardware tests

This directory holds the manual, real-hardware validation suite for the
`feat/gpu-passthrough` branch. Nothing here is wired into CI — these are
host + guest scripts plus a runbook a human follows once on each
target machine.

## Layout

- [`RUNBOOK.md`](./RUNBOOK.md) — step-by-step procedure (host + guest)
- `guest/install-test-suite.ps1` — installs benchmarks + Ollama in the guest
- `guest/run-gpu-checks.ps1` — runs benchmarks and writes a PASS/FAIL summary

## Quick start

1. Follow [`RUNBOOK.md`](./RUNBOOK.md) §0–§2 to set up the host and start the guest.
2. Inside the Windows guest:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
   .\install-test-suite.ps1
   .\run-gpu-checks.ps1
   ```
3. From the host, read `C:\WinBoatTests\results-*/summary.md`.

PASS thresholds, troubleshooting, and source citations: see the runbook.
