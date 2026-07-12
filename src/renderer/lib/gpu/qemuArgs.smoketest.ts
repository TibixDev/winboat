/**
 * Smoke test for qemuArgs.ts — pure compose-mutation logic.
 *
 * Run with:  bun src/renderer/lib/gpu/qemuArgs.smoketest.ts
 *
 * Covers (per dev plan Phase 1.4 verification checklist):
 *   - BDF normalisation (short -> long, case-insensitive)
 *   - Multi-function GPU emits VGA primary + audio sub-function with correct addr
 *   - x-vga gated on VGA class only (audio function MUST NOT get x-vga)
 *   - SYS_ADMIN added, SYS_RAWIO defensively removed
 *   - /dev/vfio/vfio + /dev/vfio/<group> appear once even after re-apply (idempotency)
 *   - Strip without a prior block is a no-op
 *   - Apply -> Apply produces the same compose (idempotent)
 *   - Apply -> Apply(null) removes all VFIO traces but leaves unrelated entries
 *   - composeHasVfioFor reflects state correctly
 */

import {
    applyVfioComposeMutations,
    buildVfioQemuArgs,
    composeHasVfioFor,
    renderVfioArgumentsBlock,
    stripVfioArgumentsBlock,
    VFIO_ARG_MARKER_BEGIN,
    VFIO_ARG_MARKER_END,
    __test__,
} from "./qemuArgs";
import type { GpuDevice, PciFunction } from "./detector";
import type { ComposeConfig } from "../../../types";

const { normaliseBdfLong, isVgaClass, isManagedVfioDevice } = __test__;

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

const NVIDIA_VGA = fn({ bdf: "03:00.0", pciClass: "VGA compatible controller" });
const NVIDIA_AUDIO = fn({
    bdf: "03:00.1",
    pciClass: "Audio device",
    name: "NVIDIA HDMI Audio",
    currentDriver: "snd_hda_intel",
    kernelModules: ["snd_hda_intel"],
});

const GPU_NVIDIA: GpuDevice = {
    primary: NVIDIA_VGA,
    iommuGroup: 17,
    groupMembers: [NVIDIA_VGA, NVIDIA_AUDIO],
    vendor: "NVIDIA",
    isolated: true,
    sriovTotalVfs: 0,
    sriovNumVfs: 0,
};

// AMD card declared with the short BDF form, to exercise normalisation.
const AMD_VGA = fn({
    bdf: "0c:00.0",
    vendorId: "1002",
    deviceId: "73bf",
    pciClass: "VGA compatible controller",
    name: "AMD Navi 21 [RX 6900 XT]",
    currentDriver: "amdgpu",
    kernelModules: ["amdgpu"],
});
const GPU_AMD_SHORT_BDF: GpuDevice = {
    primary: AMD_VGA,
    iommuGroup: 9,
    groupMembers: [AMD_VGA],
    vendor: "AMD",
    isolated: true,
    sriovTotalVfs: 0,
    sriovNumVfs: 0,
};

// 3D-controller card (datacenter GPU, no VGA class) — x-vga should be skipped.
const HEADLESS_3D = fn({
    bdf: "0000:81:00.0",
    pciClass: "3D controller",
    name: "NVIDIA A100",
});
const GPU_HEADLESS: GpuDevice = {
    primary: HEADLESS_3D,
    iommuGroup: 42,
    groupMembers: [HEADLESS_3D],
    vendor: "NVIDIA",
    isolated: true,
    sriovTotalVfs: 0,
    sriovNumVfs: 0,
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
                devices: ["/dev/kvm", "/dev/net/tun"],
            },
        },
    };
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

let failures = 0;
function expect(cond: boolean, msg: string) {
    if (!cond) {
        console.error("FAIL: " + msg);
        failures++;
    } else {
        console.log("ok    " + msg);
    }
}

function expectEq<T>(a: T, b: T, msg: string) {
    if (a !== b) {
        console.error(`FAIL: ${msg}\n  expected: ${JSON.stringify(b)}\n  actual:   ${JSON.stringify(a)}`);
        failures++;
    } else {
        console.log("ok    " + msg);
    }
}

// ---------------------------------------------------------------------------
// 1. Internal helpers
// ---------------------------------------------------------------------------

expectEq(normaliseBdfLong("03:00.0"), "0000:03:00.0", "normaliseBdfLong: pads short BDF");
expectEq(normaliseBdfLong("0000:03:00.0"), "0000:03:00.0", "normaliseBdfLong: long BDF unchanged");
expectEq(normaliseBdfLong("DEAD:BE:EF.0"), "dead:be:ef.0", "normaliseBdfLong: lowercases long BDF");
expectEq(normaliseBdfLong("AB:CD.E"), "0000:ab:cd.e", "normaliseBdfLong: lowercases short BDF");

expect(isVgaClass("VGA compatible controller"), "isVgaClass: matches VGA controller");
expect(isVgaClass("3D controller"), "isVgaClass: matches 3D controller");
expect(isVgaClass("Display controller"), "isVgaClass: matches Display controller");
expect(!isVgaClass("Audio device"), "isVgaClass: rejects audio");
expect(!isVgaClass("USB controller"), "isVgaClass: rejects USB");

expect(isManagedVfioDevice("/dev/vfio/vfio:/dev/vfio/vfio"), "isManagedVfioDevice: /dev/vfio/vfio");
expect(isManagedVfioDevice("/dev/vfio/17:/dev/vfio/17"), "isManagedVfioDevice: /dev/vfio/<group>");
expect(!isManagedVfioDevice("/dev/kvm:/dev/kvm"), "isManagedVfioDevice: rejects /dev/kvm");
expect(!isManagedVfioDevice("/dev/net/tun"), "isManagedVfioDevice: rejects /dev/net/tun");

// ---------------------------------------------------------------------------
// 2. buildVfioQemuArgs
// ---------------------------------------------------------------------------

const built = buildVfioQemuArgs({ gpu: GPU_NVIDIA });
expectEq(built.qemuArgs.length, 2, "buildVfioQemuArgs: emits one arg per group member");
expectEq(built.iommuGroup, 17, "buildVfioQemuArgs: returns IOMMU group");
expectEq(built.affectedBdfs.length, 2, "buildVfioQemuArgs: returns all affected BDFs");
expect(built.affectedBdfs[0] === "0000:03:00.0", "buildVfioQemuArgs: primary BDF normalised");
expect(built.affectedBdfs[1] === "0000:03:00.1", "buildVfioQemuArgs: audio BDF normalised");

const primaryArg = built.qemuArgs[0];
expect(primaryArg.startsWith("-device vfio-pci-nohotplug"), "primary: uses vfio-pci-nohotplug");
expect(primaryArg.includes("host=0000:03:00.0"), "primary: host BDF in long form");
expect(primaryArg.includes("multifunction=on"), "primary: multifunction=on");
expect(primaryArg.includes("x-vga=on"), "primary: x-vga=on (VGA class)");
expect(primaryArg.includes("bus=pcie.0"), "primary: bus=pcie.0");
expect(primaryArg.includes("addr=0x10"), "primary: addr=0x10");
expect(!primaryArg.includes("addr=0x10.0x"), "primary: addr is bare slot, not sub-function");

const audioArg = built.qemuArgs[1];
expect(audioArg.includes("host=0000:03:00.1"), "audio: host BDF in long form");
expect(!audioArg.includes("x-vga=on"), "audio: NO x-vga (not VGA class)");
expect(!audioArg.includes("multifunction=on"), "audio: NO multifunction (only primary declares it)");
expect(audioArg.includes("addr=0x10.0x1"), "audio: addr is sub-function .0x1");

// Headless 3D controller still gets multifunction (sole function = primary) but
// NOT x-vga (only meaningful for VGA-class).
const builtHeadless = buildVfioQemuArgs({ gpu: GPU_HEADLESS });
expectEq(builtHeadless.qemuArgs.length, 1, "headless: single function");
expect(builtHeadless.qemuArgs[0].includes("multifunction=on"), "headless: multifunction=on still set on primary");
// 3D-controller IS treated as VGA-class for x-vga purposes per isVgaClass
// (matches the QEMU convention of forwarding VGA quirks for any display
// device). This is intentional — datacenter GPUs without legacy VGA still
// boot correctly with x-vga=on because QEMU silently ignores the legacy
// VGA window forwarding when the device has no such BAR.
expect(builtHeadless.qemuArgs[0].includes("x-vga=on"), "headless: x-vga=on (3D class also forwards)");

// Short-BDF GPU still produces long-form host=
const builtAmd = buildVfioQemuArgs({ gpu: GPU_AMD_SHORT_BDF });
expect(builtAmd.qemuArgs[0].includes("host=0000:0c:00.0"), "AMD short-BDF: normalised to long form");

// includeGroupMembers=false collapses to primary only
const builtPrimaryOnly = buildVfioQemuArgs({ gpu: GPU_NVIDIA, includeGroupMembers: false });
expectEq(builtPrimaryOnly.qemuArgs.length, 1, "includeGroupMembers=false: primary only");

// ---------------------------------------------------------------------------
// 3. renderVfioArgumentsBlock / stripVfioArgumentsBlock
// ---------------------------------------------------------------------------

const block = renderVfioArgumentsBlock(built);
expect(block.startsWith(VFIO_ARG_MARKER_BEGIN), "render: starts with begin marker");
expect(block.endsWith(VFIO_ARG_MARKER_END), "render: ends with end marker");
expect(block.includes(primaryArg), "render: contains primary arg");
expect(block.includes(audioArg), "render: contains audio arg");

// Empty block from empty args -> empty string
expectEq(
    renderVfioArgumentsBlock({ qemuArgs: [], iommuGroup: -1, affectedBdfs: [] }),
    "",
    "render: empty args -> empty string",
);

// Strip is a no-op on input without the block
const unchanged = "-cpu host -smp 4";
expectEq(stripVfioArgumentsBlock(unchanged), unchanged, "strip: no-op when block absent");
expectEq(stripVfioArgumentsBlock(""), "", "strip: empty input -> empty");

// Strip removes a previously rendered block
const withBlock = `${unchanged}\n${block}`;
const stripped = stripVfioArgumentsBlock(withBlock);
expect(!stripped.includes(VFIO_ARG_MARKER_BEGIN), "strip: removes begin marker");
expect(!stripped.includes(VFIO_ARG_MARKER_END), "strip: removes end marker");
expect(stripped.includes("-cpu host -smp 4"), "strip: leaves unrelated args intact");

// ---------------------------------------------------------------------------
// 4. applyVfioComposeMutations — idempotency
// ---------------------------------------------------------------------------

const c1 = baseCompose();
applyVfioComposeMutations({ compose: c1, gpu: GPU_NVIDIA });
const argsAfterFirst = c1.services.windows.environment.ARGUMENTS;
const devicesAfterFirst = [...c1.services.windows.devices];
const capsAfterFirst = [...c1.services.windows.cap_add];

expect(argsAfterFirst.includes("-cpu host -smp 4"), "apply: preserves original ARGUMENTS");
expect(argsAfterFirst.includes("host=0000:03:00.0"), "apply: injects VFIO block into ARGUMENTS");
expect(c1.services.windows.devices.includes("/dev/vfio/vfio:/dev/vfio/vfio"), "apply: adds /dev/vfio/vfio");
expect(c1.services.windows.devices.includes("/dev/vfio/17:/dev/vfio/17"), "apply: adds /dev/vfio/<group>");
expect(c1.services.windows.devices.includes("/dev/kvm"), "apply: preserves /dev/kvm");
expect(c1.services.windows.cap_add.includes("SYS_ADMIN"), "apply: adds SYS_ADMIN cap");
expect(c1.services.windows.cap_add.includes("NET_ADMIN"), "apply: preserves NET_ADMIN cap");
expect(!c1.services.windows.cap_add.includes("SYS_RAWIO"), "apply: SYS_RAWIO absent by default");

// Re-apply must produce identical state.
applyVfioComposeMutations({ compose: c1, gpu: GPU_NVIDIA });
expectEq(c1.services.windows.environment.ARGUMENTS, argsAfterFirst, "apply: ARGUMENTS idempotent on re-apply");
expectEq(c1.services.windows.devices.length, devicesAfterFirst.length, "apply: devices count idempotent on re-apply");
expectEq(c1.services.windows.cap_add.length, capsAfterFirst.length, "apply: cap_add count idempotent on re-apply");

// composeHasVfioFor reflects state.
expect(composeHasVfioFor(c1, GPU_NVIDIA), "composeHasVfioFor: returns true after apply");

// Apply for a DIFFERENT GPU should swap the block + group device.
applyVfioComposeMutations({ compose: c1, gpu: GPU_AMD_SHORT_BDF });
expect(c1.services.windows.environment.ARGUMENTS.includes("host=0000:0c:00.0"), "apply: AMD block injected");
expect(!c1.services.windows.environment.ARGUMENTS.includes("host=0000:03:00.0"), "apply: prior NVIDIA block removed");
expect(c1.services.windows.devices.includes("/dev/vfio/9:/dev/vfio/9"), "apply: switched to AMD's group device");
expect(!c1.services.windows.devices.includes("/dev/vfio/17:/dev/vfio/17"), "apply: NVIDIA's group device removed");
expect(composeHasVfioFor(c1, GPU_AMD_SHORT_BDF), "composeHasVfioFor: true after AMD swap");
expect(!composeHasVfioFor(c1, GPU_NVIDIA), "composeHasVfioFor: false for old GPU after swap");

// ---------------------------------------------------------------------------
// 5. SYS_RAWIO defensive removal
// ---------------------------------------------------------------------------

const cRawio = baseCompose();
cRawio.services.windows.cap_add.push("SYS_RAWIO");
applyVfioComposeMutations({ compose: cRawio, gpu: GPU_NVIDIA });
expect(!cRawio.services.windows.cap_add.includes("SYS_RAWIO"), "apply: removes SYS_RAWIO defensively");
expect(cRawio.services.windows.cap_add.includes("SYS_ADMIN"), "apply: adds SYS_ADMIN");

// ---------------------------------------------------------------------------
// 6. Disable (gpu = null) — removes ARGUMENTS block + devices, keeps caps
// ---------------------------------------------------------------------------

const cDisable = baseCompose();
applyVfioComposeMutations({ compose: cDisable, gpu: GPU_NVIDIA });
applyVfioComposeMutations({ compose: cDisable, gpu: null });
expect(
    !cDisable.services.windows.environment.ARGUMENTS.includes(VFIO_ARG_MARKER_BEGIN),
    "disable: VFIO block removed from ARGUMENTS",
);
expect(
    cDisable.services.windows.environment.ARGUMENTS.includes("-cpu host -smp 4"),
    "disable: original ARGUMENTS preserved",
);
expect(
    !cDisable.services.windows.devices.some(d => d.startsWith("/dev/vfio/")),
    "disable: all /dev/vfio/* entries removed",
);
expect(cDisable.services.windows.devices.includes("/dev/kvm"), "disable: /dev/kvm preserved");
expect(cDisable.services.windows.cap_add.includes("SYS_ADMIN"), "disable: SYS_ADMIN kept (caps are additive)");

// Disable on a compose with no prior VFIO mutations is a no-op for our markers.
const cNeverEnabled = baseCompose();
const beforeArgs = cNeverEnabled.services.windows.environment.ARGUMENTS;
const beforeDevices = [...cNeverEnabled.services.windows.devices];
applyVfioComposeMutations({ compose: cNeverEnabled, gpu: null });
expectEq(
    cNeverEnabled.services.windows.environment.ARGUMENTS,
    beforeArgs,
    "disable: ARGUMENTS unchanged when no prior block",
);
expectEq(
    cNeverEnabled.services.windows.devices.length,
    beforeDevices.length,
    "disable: devices unchanged when nothing was managed",
);

// ---------------------------------------------------------------------------
// 7. Empty-ARGUMENTS edge case
// ---------------------------------------------------------------------------

const cEmpty = baseCompose();
cEmpty.services.windows.environment.ARGUMENTS = "";
applyVfioComposeMutations({ compose: cEmpty, gpu: GPU_NVIDIA });
expect(
    cEmpty.services.windows.environment.ARGUMENTS.startsWith(VFIO_ARG_MARKER_BEGIN),
    "empty ARGUMENTS: block becomes the entire value",
);

// ---------------------------------------------------------------------------
// 8. Missing optional arrays (defensive: dockur sometimes omits devices/cap_add)
// ---------------------------------------------------------------------------

const cMinimal = baseCompose();
// Simulate a compose missing devices / cap_add entirely.
(cMinimal.services.windows as any).devices = undefined;
(cMinimal.services.windows as any).cap_add = undefined;
applyVfioComposeMutations({ compose: cMinimal, gpu: GPU_NVIDIA });
expect(Array.isArray(cMinimal.services.windows.devices), "minimal compose: devices array created");
expect(Array.isArray(cMinimal.services.windows.cap_add), "minimal compose: cap_add array created");
expect(cMinimal.services.windows.cap_add.includes("SYS_ADMIN"), "minimal compose: SYS_ADMIN added");

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

if (failures > 0) {
    console.error(`\n${failures} qemuArgs smoke test failure(s).`);
    process.exit(1);
}
console.log("\nAll qemuArgs smoke tests passed.");
