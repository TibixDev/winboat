/**
 * Smoke test for gpuManager.ts — planner + orchestrator with mocked deps.
 *
 * Run with:  bun src/renderer/lib/gpu/gpuManager.smoketest.ts
 */

import {
    applyGpuPassthroughIfEnabled,
    planGpuPassthrough,
    releaseGpuPassthroughIfNeeded,
    __test__,
    type WinboatLike,
} from "./gpuManager";
import type { GpuDevice, GpuTopology, PciFunction } from "./detector";
import type { ComposeConfig } from "../../../types";

// Inline the enum values to avoid pulling in config.ts -> winboat.ts ->
// @electron/remote, which fails to load outside Electron. The runtime
// values must match src/renderer/lib/config.ts. Cast through `any` so
// these string literals are assignable to the GpuPassthroughMode type
// used in the public gpuManager signatures.
const GpuPassthroughMode = {
    Off: "Off" as any,
    Vfio: "VFIO" as any,
    SrIov: "SR-IOV" as any,
    Mvisor: "mvisor-VGPU" as any,
} as const;

const { normalizeBdf, composeEqual, ineligibilityReason } = __test__;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fn(over: Partial<PciFunction>): PciFunction {
    return {
        bdf: "03:00.0",
        vendorId: "10de",
        deviceId: "2206",
        pciClass: "VGA compatible controller",
        name: "NVIDIA GA102 [GeForce RTX 3080]",
        currentDriver: "nvidia",
        kernelModules: ["nvidia"],
        ...over,
    };
}

const NVIDIA_VGA = fn({});
const NVIDIA_AUDIO = fn({
    bdf: "03:00.1",
    pciClass: "Audio device",
    name: "NVIDIA HDMI Audio",
});

const GPU: GpuDevice = {
    primary: NVIDIA_VGA,
    iommuGroup: 17,
    groupMembers: [NVIDIA_VGA, NVIDIA_AUDIO],
    vendor: "NVIDIA",
    isolated: true,
    sriovTotalVfs: 0,
    sriovNumVfs: 0,
};

const GPU_NOT_ISOLATED: GpuDevice = { ...GPU, isolated: false };

const TOPOLOGY_OK: GpuTopology = {
    iommu: { enabled: true, type: "intel" },
    vfio: { moduleLoaded: true, moduleAvailable: true },
    gpus: [GPU],
    warnings: [],
};

const TOPOLOGY_NO_IOMMU: GpuTopology = {
    ...TOPOLOGY_OK,
    iommu: { enabled: false, type: null },
};

const TOPOLOGY_NOT_ISOLATED: GpuTopology = {
    ...TOPOLOGY_OK,
    gpus: [GPU_NOT_ISOLATED],
};

function baseCompose(): ComposeConfig {
    return {
        name: "winboat",
        volumes: { winboat_data: null },
        services: {
            windows: {
                image: "dockurr/windows",
                container_name: "WinBoat",
                environment: {
                    VERSION: "11" as any,
                    RAM_SIZE: "4G",
                    CPU_CORES: "4",
                    DISK_SIZE: "64G",
                    USERNAME: "Docker",
                    PASSWORD: "admin",
                    HOME: "/home/user",
                    LANGUAGE: "English",
                    ARGUMENTS: "-cpu host -smp 4",
                    HOST_PORTS: "8006",
                },
                privileged: true,
                ports: ["8006:8006"],
                cap_add: ["NET_ADMIN"],
                stop_grace_period: "120s",
                restart: "on-failure",
                volumes: ["./storage:/storage"],
                devices: ["/dev/kvm"],
            },
        },
    };
}

function mockWinboat(compose: ComposeConfig, running = false): WinboatLike & { replaceCalls: number; writeCalls: number; current: ComposeConfig } {
    let current = JSON.parse(JSON.stringify(compose));
    let replaceCalls = 0;
    let writeCalls = 0;
    return {
        isRunning: () => running,
        composeFilePath: () => "/tmp/docker-compose.yml",
        readCompose: () => JSON.parse(JSON.stringify(current)),
        replaceCompose: async (c) => { current = JSON.parse(JSON.stringify(c)); replaceCalls++; },
        writeComposeOnly: (c) => { current = JSON.parse(JSON.stringify(c)); writeCalls++; },
        get replaceCalls() { return replaceCalls; },
        get writeCalls() { return writeCalls; },
        get current() { return current; },
    };
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

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
// 1. Internal helpers
// ---------------------------------------------------------------------------

expectEq(normalizeBdf("03:00.0"), "0000:03:00.0", "normalizeBdf: pads short BDF");
expectEq(normalizeBdf("0000:03:00.0"), "0000:03:00.0", "normalizeBdf: long BDF unchanged");
expectEq(normalizeBdf("AB:CD.E"), "0000:ab:cd.e", "normalizeBdf: lowercases short BDF");

expect(composeEqual(baseCompose(), baseCompose()), "composeEqual: identical composes");
const cA = baseCompose();
const cB = baseCompose();
cB.services.windows.environment.RAM_SIZE = "8G";
expect(!composeEqual(cA, cB), "composeEqual: detects RAM diff");

expectEq(
    ineligibilityReason(TOPOLOGY_NO_IOMMU, GPU),
    "IOMMU is not enabled in the kernel.",
    "ineligibilityReason: IOMMU disabled",
);
expectEq(
    ineligibilityReason(TOPOLOGY_NOT_ISOLATED, GPU_NOT_ISOLATED),
    "IOMMU group 17 is not isolated (groups other devices).",
    "ineligibilityReason: not isolated",
);

// ---------------------------------------------------------------------------
// 2. planGpuPassthrough
// ---------------------------------------------------------------------------

const planOff = planGpuPassthrough(baseCompose(), {
    gpuPassthroughMode: GpuPassthroughMode.Off,
    gpuPassthroughDevice: "",
}, TOPOLOGY_OK);
expectEq(planOff.decision.kind, "disable", "plan: Off mode + clean compose -> disable");

// Off mode + previously-enabled compose should signal "ready" with gpu=null + needsReplace.
const dirty = baseCompose();
dirty.services.windows.environment.ARGUMENTS += "\n# >>> winboat vfio-pci begin (auto-generated; do not edit by hand) >>>\n-device vfio-pci-nohotplug,host=0000:03:00.0,multifunction=on,x-vga=on,bus=pcie.0,addr=0x10\n# <<< winboat vfio-pci end <<<";
dirty.services.windows.devices.push("/dev/vfio/vfio:/dev/vfio/vfio", "/dev/vfio/17:/dev/vfio/17");
const planCleanup = planGpuPassthrough(dirty, {
    gpuPassthroughMode: GpuPassthroughMode.Off,
    gpuPassthroughDevice: "",
}, TOPOLOGY_OK);
expectEq(planCleanup.decision.kind, "ready", "plan: Off + dirty compose -> ready (cleanup)");
if (planCleanup.decision.kind === "ready") {
    expectEq(planCleanup.decision.gpu, null, "plan: cleanup gpu is null");
    expect(planCleanup.decision.needsReplace, "plan: cleanup needsReplace=true");
}

const planNoDevice = planGpuPassthrough(baseCompose(), {
    gpuPassthroughMode: GpuPassthroughMode.Vfio,
    gpuPassthroughDevice: "",
}, TOPOLOGY_OK);
expectEq(planNoDevice.decision.kind, "noop", "plan: VFIO + no device -> noop");

const planMissing = planGpuPassthrough(baseCompose(), {
    gpuPassthroughMode: GpuPassthroughMode.Vfio,
    gpuPassthroughDevice: "99:00.0",
}, TOPOLOGY_OK);
expectEq(planMissing.decision.kind, "device-missing", "plan: VFIO + missing BDF -> device-missing");

const planIneligible = planGpuPassthrough(baseCompose(), {
    gpuPassthroughMode: GpuPassthroughMode.Vfio,
    gpuPassthroughDevice: "03:00.0",
}, TOPOLOGY_NOT_ISOLATED);
expectEq(planIneligible.decision.kind, "ineligible", "plan: VFIO + not isolated -> ineligible");

const planReady = planGpuPassthrough(baseCompose(), {
    gpuPassthroughMode: GpuPassthroughMode.Vfio,
    gpuPassthroughDevice: "03:00.0",
}, TOPOLOGY_OK);
expectEq(planReady.decision.kind, "ready", "plan: VFIO + eligible -> ready");
if (planReady.decision.kind === "ready") {
    expect(!!planReady.decision.gpu, "plan: ready has gpu");
    expect(planReady.decision.needsReplace, "plan: first apply needsReplace=true");
    expect(
        planReady.decision.mutated.services.windows.environment.ARGUMENTS.includes("host=0000:03:00.0"),
        "plan: mutated compose has VFIO host=",
    );
}

// Re-planning with the already-mutated compose should NOT need a replace.
if (planReady.decision.kind === "ready") {
    const planReplay = planGpuPassthrough(planReady.decision.mutated, {
        gpuPassthroughMode: GpuPassthroughMode.Vfio,
        gpuPassthroughDevice: "03:00.0",
    }, TOPOLOGY_OK);
    expectEq(planReplay.decision.kind, "ready", "plan: replay -> ready");
    if (planReplay.decision.kind === "ready") {
        expect(!planReplay.decision.needsReplace, "plan: replay needsReplace=false (idempotent)");
    }
}

// ---------------------------------------------------------------------------
// 3. applyGpuPassthroughIfEnabled (orchestrator) with mocked deps
// ---------------------------------------------------------------------------

function mockDeps(opts: { topology?: GpuTopology; bindOk?: boolean; modprobeOk?: boolean } = {}) {
    let bindCalls = 0;
    let unbindCalls = 0;
    let modprobeCalls = 0;
    return {
        deps: {
            detect: async () => opts.topology ?? TOPOLOGY_OK,
            bind: async (bdf: string, _ig?: boolean) => {
                bindCalls++;
                return { ok: opts.bindOk ?? true, action: "bind", bdf, error: (opts.bindOk === false) ? "mocked failure" : undefined };
            },
            unbind: async (bdf: string, _ig?: boolean) => {
                unbindCalls++;
                return { ok: true, action: "unbind", bdf };
            },
            modprobe: async () => {
                modprobeCalls++;
                return { ok: opts.modprobeOk ?? true, action: "modprobe", error: (opts.modprobeOk === false) ? "mocked modprobe fail" : undefined };
            },
        },
        get bindCalls() { return bindCalls; },
        get unbindCalls() { return unbindCalls; },
        get modprobeCalls() { return modprobeCalls; },
    };
}

// 3a. mode = Off => disabled, no helper calls
{
    const wb = mockWinboat(baseCompose());
    const m = mockDeps();
    const r = await applyGpuPassthroughIfEnabled(wb, {
        gpuPassthroughMode: GpuPassthroughMode.Off,
        gpuPassthroughDevice: "",
    }, m.deps);
    expectEq(r.status, "disabled", "apply Off: status=disabled");
    expectEq(m.bindCalls, 0, "apply Off: no bind calls");
    expectEq(wb.replaceCalls, 0, "apply Off: no replaceCompose");
}

// 3b. mode = VFIO, no device => no-device
{
    const wb = mockWinboat(baseCompose());
    const m = mockDeps();
    const r = await applyGpuPassthroughIfEnabled(wb, {
        gpuPassthroughMode: GpuPassthroughMode.Vfio,
        gpuPassthroughDevice: "",
    }, m.deps);
    expectEq(r.status, "no-device", "apply VFIO no device: status=no-device");
    expectEq(m.bindCalls, 0, "apply VFIO no device: no bind");
}

// 3c. mode = VFIO, missing BDF => device-missing
{
    const wb = mockWinboat(baseCompose());
    const m = mockDeps();
    const r = await applyGpuPassthroughIfEnabled(wb, {
        gpuPassthroughMode: GpuPassthroughMode.Vfio,
        gpuPassthroughDevice: "99:00.0",
    }, m.deps);
    expectEq(r.status, "device-missing", "apply VFIO bogus BDF: status=device-missing");
    expect(!r.ok, "apply VFIO bogus BDF: ok=false");
}

// 3d. mode = VFIO, not isolated => ineligible
{
    const wb = mockWinboat(baseCompose());
    const m = mockDeps({ topology: TOPOLOGY_NOT_ISOLATED });
    const r = await applyGpuPassthroughIfEnabled(wb, {
        gpuPassthroughMode: GpuPassthroughMode.Vfio,
        gpuPassthroughDevice: "03:00.0",
    }, m.deps);
    expectEq(r.status, "ineligible", "apply VFIO not isolated: status=ineligible");
}

// 3e. happy path: container stopped, compose changes -> writeComposeOnly + modprobe + bind
{
    const wb = mockWinboat(baseCompose(), false);
    const m = mockDeps();
    const r = await applyGpuPassthroughIfEnabled(wb, {
        gpuPassthroughMode: GpuPassthroughMode.Vfio,
        gpuPassthroughDevice: "03:00.0",
    }, m.deps);
    expectEq(r.status, "compose-updated", "apply happy stopped: status=compose-updated");
    expect(r.ok, "apply happy stopped: ok=true");
    expectEq(wb.writeCalls, 1, "apply happy stopped: writeComposeOnly called once");
    expectEq(wb.replaceCalls, 0, "apply happy stopped: replaceCompose NOT called (container stopped)");
    expectEq(m.modprobeCalls, 1, "apply happy stopped: modprobe called");
    expectEq(m.bindCalls, 1, "apply happy stopped: bind called once");
    expect(wb.current.services.windows.environment.ARGUMENTS.includes("host=0000:03:00.0"),
        "apply happy stopped: compose persisted with VFIO block");
}

// 3f. happy path 2: container running, compose changes -> replaceCompose
{
    const wb = mockWinboat(baseCompose(), true);
    const m = mockDeps();
    const r = await applyGpuPassthroughIfEnabled(wb, {
        gpuPassthroughMode: GpuPassthroughMode.Vfio,
        gpuPassthroughDevice: "03:00.0",
    }, m.deps);
    expectEq(r.status, "compose-updated", "apply happy running: status=compose-updated");
    expectEq(wb.replaceCalls, 1, "apply happy running: replaceCompose called once");
    expectEq(wb.writeCalls, 0, "apply happy running: writeComposeOnly NOT called");
}

// 3g. re-apply (compose already correct) -> no replace, but bind still called (idempotent)
{
    const wb = mockWinboat(baseCompose(), false);
    // First apply mutates compose.
    const m1 = mockDeps();
    await applyGpuPassthroughIfEnabled(wb, {
        gpuPassthroughMode: GpuPassthroughMode.Vfio,
        gpuPassthroughDevice: "03:00.0",
    }, m1.deps);
    expectEq(wb.writeCalls, 1, "apply re-apply: first call writes");

    // Second apply should NOT re-write.
    const m2 = mockDeps();
    const r2 = await applyGpuPassthroughIfEnabled(wb, {
        gpuPassthroughMode: GpuPassthroughMode.Vfio,
        gpuPassthroughDevice: "03:00.0",
    }, m2.deps);
    expectEq(r2.status, "ok", "apply re-apply: second call status=ok (no compose change)");
    expectEq(wb.writeCalls, 1, "apply re-apply: writeComposeOnly NOT called again");
    expectEq(m2.bindCalls, 1, "apply re-apply: bind still called (idempotent on kernel side)");
}

// 3h. modprobe failure aborts before bind
{
    const wb = mockWinboat(baseCompose(), false);
    const m = mockDeps({ modprobeOk: false });
    const r = await applyGpuPassthroughIfEnabled(wb, {
        gpuPassthroughMode: GpuPassthroughMode.Vfio,
        gpuPassthroughDevice: "03:00.0",
    }, m.deps);
    expectEq(r.status, "bind-failed", "apply modprobe-fail: status=bind-failed");
    expect(!r.ok, "apply modprobe-fail: ok=false");
    expectEq(m.bindCalls, 0, "apply modprobe-fail: bind NOT called");
}

// 3i. bind failure surfaces as bind-failed
{
    const wb = mockWinboat(baseCompose(), false);
    const m = mockDeps({ bindOk: false });
    const r = await applyGpuPassthroughIfEnabled(wb, {
        gpuPassthroughMode: GpuPassthroughMode.Vfio,
        gpuPassthroughDevice: "03:00.0",
    }, m.deps);
    expectEq(r.status, "bind-failed", "apply bind-fail: status=bind-failed");
    expect(!r.ok, "apply bind-fail: ok=false");
}

// ---------------------------------------------------------------------------
// 4. releaseGpuPassthroughIfNeeded
// ---------------------------------------------------------------------------

// 4a. mode != VFIO => skipped
{
    const wb = mockWinboat(baseCompose());
    const m = mockDeps();
    const r = await releaseGpuPassthroughIfNeeded(wb, {
        gpuPassthroughMode: GpuPassthroughMode.Off,
        gpuPassthroughDevice: "",
        gpuDynamicUnbind: true,
    }, m.deps);
    expectEq(r.status, "skipped", "release Off: status=skipped");
    expectEq(m.unbindCalls, 0, "release Off: no unbind");
}

// 4b. dynamicUnbind=false => skipped (default)
{
    const wb = mockWinboat(baseCompose());
    const m = mockDeps();
    const r = await releaseGpuPassthroughIfNeeded(wb, {
        gpuPassthroughMode: GpuPassthroughMode.Vfio,
        gpuPassthroughDevice: "03:00.0",
        gpuDynamicUnbind: false,
    }, m.deps);
    expectEq(r.status, "skipped", "release dyn-off: status=skipped");
    expectEq(m.unbindCalls, 0, "release dyn-off: no unbind");
}

// 4c. dynamicUnbind=true => unbind called
{
    const wb = mockWinboat(baseCompose());
    const m = mockDeps();
    const r = await releaseGpuPassthroughIfNeeded(wb, {
        gpuPassthroughMode: GpuPassthroughMode.Vfio,
        gpuPassthroughDevice: "03:00.0",
        gpuDynamicUnbind: true,
    }, m.deps);
    expectEq(r.status, "ok", "release dyn-on: status=ok");
    expect(r.ok, "release dyn-on: ok=true");
    expectEq(m.unbindCalls, 1, "release dyn-on: unbind called");
}

if (failures > 0) {
    console.error("\n" + failures + " gpuManager smoke test failure(s).");
    process.exit(1);
}
console.log("\nAll gpuManager smoke tests passed.");
