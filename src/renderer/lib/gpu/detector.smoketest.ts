/**
 * Smoke test for the GPU detector parsing logic.
 *
 * Run with:  bun src/renderer/lib/gpu/detector.smoketest.ts
 *
 * This is a temporary scaffolding file to verify parseLspci against real
 * lspci output samples. Will be replaced by a proper vitest suite once
 * test infrastructure is added to the repo.
 */

import { __test__ } from "./detector";

const { parseLspci, classifyVendor } = __test__;

// ---------------------------------------------------------------------------
// Real-world lspci output samples (collected from VFIO community write-ups).
// Domain prefix included in all samples per `lspci -nnk -D`.
// ---------------------------------------------------------------------------

const SAMPLE_NVIDIA_3080 = `
0000:01:00.0 VGA compatible controller [0300]: NVIDIA Corporation GA102 [GeForce RTX 3080] [10de:2206] (rev a1)
	Subsystem: ASUSTeK Computer Inc. GA102 [GeForce RTX 3080] [1043:87b1]
	Kernel driver in use: nvidia
	Kernel modules: nouveau, nvidia_drm, nvidia
0000:01:00.1 Audio device [0403]: NVIDIA Corporation GA102 High Definition Audio Controller [10de:1aef] (rev a1)
	Subsystem: ASUSTeK Computer Inc. GA102 High Definition Audio Controller [1043:87b1]
	Kernel driver in use: snd_hda_intel
	Kernel modules: snd_hda_intel
`;

const SAMPLE_AMD_6900XT = `
0000:0c:00.0 VGA compatible controller [0300]: Advanced Micro Devices, Inc. [AMD/ATI] Navi 21 [Radeon RX 6800/6800 XT / 6900 XT] [1002:73bf] (rev c0)
	Subsystem: Sapphire Technology Limited Navi 21 [Radeon RX 6800/6800 XT / 6900 XT] [1da2:e438]
	Kernel driver in use: amdgpu
	Kernel modules: amdgpu
0000:0c:00.1 Audio device [0403]: Advanced Micro Devices, Inc. [AMD/ATI] Navi 21 HDMI Audio [1002:ab28]
	Subsystem: Sapphire Technology Limited Navi 21 HDMI Audio [1da2:ab28]
	Kernel driver in use: snd_hda_intel
	Kernel modules: snd_hda_intel
`;

const SAMPLE_INTEL_IGPU = `
0000:00:02.0 VGA compatible controller [0300]: Intel Corporation AlderLake-S GT1 [8086:4680] (rev 0c)
	Subsystem: ASUSTeK Computer Inc. Device [1043:8694]
	Kernel driver in use: i915
	Kernel modules: i915
`;

const SAMPLE_VFIO_BOUND = `
0000:03:00.0 VGA compatible controller [0300]: NVIDIA Corporation TU104 [GeForce RTX 2070 SUPER] [10de:1e84] (rev a1)
	Kernel driver in use: vfio-pci
	Kernel modules: nouveau, nvidia_drm, nvidia
`;

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

function expect(cond: boolean, msg: string) {
    if (!cond) {
        console.error("FAIL: " + msg);
        process.exit(1);
    } else {
        console.log("ok    " + msg);
    }
}

const nv = parseLspci(SAMPLE_NVIDIA_3080);
expect(nv.length === 2, "NVIDIA sample: parses two functions");
expect(nv[0].bdf === "01:00.0", "NVIDIA sample: VGA bdf = 01:00.0");
expect(nv[0].vendorId === "10de", "NVIDIA sample: vendor = 10de");
expect(nv[0].deviceId === "2206", "NVIDIA sample: device = 2206");
expect(nv[0].currentDriver === "nvidia", "NVIDIA sample: driver = nvidia");
expect(nv[0].kernelModules.includes("nvidia"), "NVIDIA sample: nvidia module listed");
expect(nv[0].kernelModules.includes("nouveau"), "NVIDIA sample: nouveau module listed");
expect(nv[0].name.includes("GeForce RTX 3080"), "NVIDIA sample: name contains model");
expect(nv[1].bdf === "01:00.1", "NVIDIA sample: audio bdf = 01:00.1");
expect(nv[1].currentDriver === "snd_hda_intel", "NVIDIA sample: audio driver = snd_hda_intel");

const amd = parseLspci(SAMPLE_AMD_6900XT);
expect(amd.length === 2, "AMD sample: parses two functions");
expect(amd[0].vendorId === "1002", "AMD sample: vendor = 1002");
expect(amd[0].currentDriver === "amdgpu", "AMD sample: driver = amdgpu");

const intel = parseLspci(SAMPLE_INTEL_IGPU);
expect(intel.length === 1, "Intel sample: parses single function");
expect(intel[0].vendorId === "8086", "Intel sample: vendor = 8086");
expect(intel[0].currentDriver === "i915", "Intel sample: driver = i915");

const vfio = parseLspci(SAMPLE_VFIO_BOUND);
expect(vfio.length === 1, "vfio-bound sample: parses single function");
expect(vfio[0].currentDriver === "vfio-pci", "vfio-bound sample: driver = vfio-pci");

expect(classifyVendor("10de") === "NVIDIA", "classifyVendor: 10de -> NVIDIA");
expect(classifyVendor("1002") === "AMD", "classifyVendor: 1002 -> AMD");
expect(classifyVendor("8086") === "INTEL", "classifyVendor: 8086 -> INTEL");
expect(classifyVendor("1234") === "UNKNOWN", "classifyVendor: 1234 -> UNKNOWN");

// Edge: empty input
expect(parseLspci("").length === 0, "empty input -> []");

// Edge: header only, no driver lines
expect(
    parseLspci("0000:00:01.0 VGA compatible controller [0300]: FooCorp Bar [abcd:1234]").length === 1,
    "header-only entry parses",
);

console.log("\nAll detector smoke tests passed.");
