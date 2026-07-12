/**
 * Smoke test for the Phase 2 SR-IOV orchestrator (applySriovPassthrough).
 *
 * Tests the decision logic with mocked sriov.ts deps. No real /sys access,
 * no pkexec, no helper binary.
 *
 * Run with:  bun src/renderer/lib/gpu/sriov.smoketest.ts
 */

import { applySriovPassthrough, applyMvisorPassthrough } from "./gpuManager";

let failures = 0;
function expect(cond: boolean, msg: string) {
    if (!cond) { console.error("FAIL: " + msg); failures++; }
    else console.log("ok    " + msg);
}
function expectEq<T>(a: T, b: T, msg: string) {
    if (a !== b) { console.error("FAIL: " + msg + "\n  expected: " + JSON.stringify(b) + "\n  actual:   " + JSON.stringify(a)); failures++; }
    else console.log("ok    " + msg);
}

// ---------------------------------------------------------------------------
// applySriovPassthrough
// ---------------------------------------------------------------------------

// 1. Driver doesn't support SR-IOV -> ineligible
{
    let probeCalls = 0;
    let configCalls = 0;
    const r = await applySriovPassthrough("00:02.0", {
        probe: async () => { probeCalls++; return { ok: true, sriov_supported: false, sriov_total_vfs: 7 }; },
        configure: async () => { configCalls++; return { ok: true, sriov_num_vfs: 1 }; },
        status: async () => ({ ok: true }),
    });
    expectEq(r.status, "ineligible", "sriov i915-style probe-fail: status=ineligible");
    expect(!r.ok, "sriov i915-style: ok=false");
    expectEq(probeCalls, 1, "sriov i915-style: probe called once");
    expectEq(configCalls, 0, "sriov i915-style: configure NOT called");
    expect(r.message.includes("sriov_configure"), "sriov i915-style: message mentions sriov_configure");
}

// 2. Probe errors -> bind-failed surface
{
    const r = await applySriovPassthrough("00:02.0", {
        probe: async () => ({ ok: false, error: "BDF not found in sysfs" }),
        configure: async () => ({ ok: true, sriov_num_vfs: 1 }),
        status: async () => ({ ok: true }),
    });
    expectEq(r.status, "ineligible", "sriov probe-error: status=ineligible");
    expect(r.message.includes("BDF not found"), "sriov probe-error: original error surfaced");
}

// 3. Happy path -> compose-updated + VF hint
{
    let configuredN = -1;
    const r = await applySriovPassthrough("0000:00:02.0", {
        probe: async () => ({ ok: true, sriov_supported: true, sriov_total_vfs: 7 }),
        configure: async (_bdf, n) => { configuredN = n; return { ok: true, sriov_num_vfs: 1 }; },
        status: async () => ({ ok: true }),
    });
    expectEq(r.status, "compose-updated", "sriov happy: status=compose-updated");
    expect(r.ok, "sriov happy: ok=true");
    expectEq(configuredN, 1, "sriov happy: configure(bdf, 1)");
    expect(!!r.vfBdf, "sriov happy: vfBdf returned");
    expectEq(r.vfBdf, "0000:00:02.1", "sriov happy: vfBdf is PF + .1");
}

// 4. Short BDF input also yields correct VF hint
{
    const r = await applySriovPassthrough("00:02.0", {
        probe: async () => ({ ok: true, sriov_supported: true, sriov_total_vfs: 7 }),
        configure: async () => ({ ok: true, sriov_num_vfs: 1 }),
        status: async () => ({ ok: true }),
    });
    expectEq(r.vfBdf, "0000:00:02.1", "sriov short-BDF: hint normalised to long form");
}

// 5. Configure returns OK but reports 0 VFs (silent driver no-op)
{
    const r = await applySriovPassthrough("00:02.0", {
        probe: async () => ({ ok: true, sriov_supported: true, sriov_total_vfs: 7 }),
        configure: async () => ({ ok: true, sriov_num_vfs: 0 }),
        status: async () => ({ ok: true }),
    });
    expectEq(r.status, "bind-failed", "sriov silent-noop: status=bind-failed");
    expect(r.message.includes("no-op") || r.message.includes("i915"), "sriov silent-noop: message mentions driver no-op");
}

// 6. Configure returns ok=false -> bind-failed with helper error
{
    const r = await applySriovPassthrough("00:02.0", {
        probe: async () => ({ ok: true, sriov_supported: true, sriov_total_vfs: 7 }),
        configure: async () => ({ ok: false, error: "write -EINVAL" }),
        status: async () => ({ ok: true }),
    });
    expectEq(r.status, "bind-failed", "sriov config-fail: status=bind-failed");
    expect(r.message.includes("write -EINVAL"), "sriov config-fail: error surfaced");
}

// ---------------------------------------------------------------------------
// applyMvisorPassthrough (Phase 3 stub)
// ---------------------------------------------------------------------------

{
    const r = await applyMvisorPassthrough();
    expect(!r.ok, "mvisor stub: ok=false (stub)");
    expectEq(r.status, "ineligible", "mvisor stub: status=ineligible");
    expect(r.message.includes("Phase 3"), "mvisor stub: message mentions Phase 3");
}

if (failures > 0) {
    console.error("\n" + failures + " sriov/mvisor smoke test failure(s).");
    process.exit(1);
}
console.log("\nAll sriov/mvisor smoke tests passed.");
