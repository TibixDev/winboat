/**
 * GPU detector — read-only host probe for VFIO PCIe passthrough viability.
 *
 * Everything in this module is **read-only** and runs without privileges.
 * Privileged operations (driver_override writes, sriov_numvfs writes,
 * vfio-pci modprobe) live in the polkit helper invoked from `./vfio.ts`
 * (Phase 1.3 — not yet added at the time of this commit).
 *
 * Source-of-truth references (all primary):
 *   - /sys/kernel/iommu_groups/ layout:
 *     https://www.kernel.org/doc/Documentation/ABI/testing/sysfs-kernel-iommu_groups
 *   - lspci -nnk output stability (pciutils ≥ 3.2):
 *     https://manpages.debian.org/unstable/pciutils/lspci.8.en.html
 *   - SR-IOV sysfs attrs:
 *     https://docs.kernel.org/6.4/PCI/pci-iov-howto.html
 *   - VFIO model (groups must be passed together):
 *     http://vfio.blogspot.com/2014/08/iommu-groups-inside-and-out.html
 */

// We use require() instead of `import` so Vite leaves the Node built-ins
// alone (the renderer has nodeIntegration enabled in this app; see
// src/main/main.ts BrowserWindow webPreferences). This matches the
// pattern in winboat.ts, specs.ts, usbmanager.ts.
const childProcess: typeof import("node:child_process") = require("node:child_process");
const nodeUtil: typeof import("node:util") = require("node:util");
const fsPromises: typeof import("node:fs/promises") = require("node:fs/promises");
const nodeFs: typeof import("node:fs") = require("node:fs");
const nodePath: typeof import("node:path") = require("node:path");

const execAsync = nodeUtil.promisify(childProcess.exec);
const { readFile, readdir, stat } = fsPromises;
const { existsSync } = nodeFs;
const { join } = nodePath;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** PCI vendor IDs we care about. Hex, lowercased, no "0x" prefix. */
export const PCI_VENDOR = {
    NVIDIA: "10de",
    AMD: "1002",
    INTEL: "8086",
} as const;

export type GpuVendor = keyof typeof PCI_VENDOR | "UNKNOWN";

/** A single PCI function (one row in `lspci`). */
export interface PciFunction {
    /** Bus:Device.Function string, e.g. "03:00.0". */
    bdf: string;
    /** Hex vendor ID, e.g. "10de". */
    vendorId: string;
    /** Hex device ID, e.g. "2204". */
    deviceId: string;
    /** Human-readable PCI class, e.g. "VGA compatible controller". */
    pciClass: string;
    /** Human-readable device name as reported by lspci. */
    name: string;
    /** Currently-bound kernel driver, or `null` if unbound. */
    currentDriver: string | null;
    /** Kernel modules that *can* bind, per lspci. */
    kernelModules: string[];
}

/** A GPU plus everything in its IOMMU group. */
export interface GpuDevice {
    /** The primary VGA / 3D function. */
    primary: PciFunction;
    /** IOMMU group number; -1 when IOMMU is not enabled. */
    iommuGroup: number;
    /** Every function in the same IOMMU group, including `primary`. */
    groupMembers: PciFunction[];
    /** Convenience: vendor classification. */
    vendor: GpuVendor;
    /**
     * True iff the group is "clean" — only contains this GPU's own
     * functions (typically VGA + HDMI audio). When false, passing the GPU
     * through forces passing through unrelated devices on the same group,
     * which is almost never what the user wants.
     */
    isolated: boolean;
    /**
     * SR-IOV potential. `totalVfs` > 0 indicates the device advertises
     * SR-IOV via the standard PCI capability; it does NOT mean the driver
     * implements `sriov_configure`. The active write-probe lives in
     * Phase 2 (`sriov.ts`) because it requires elevated permissions.
     */
    sriovTotalVfs: number;
    /** Currently-instantiated VFs. */
    sriovNumVfs: number;
}

export interface IommuStatus {
    /** True iff `/sys/kernel/iommu_groups/` is present *and* non-empty. */
    enabled: boolean;
    /**
     * IOMMU type as seen by the kernel: "intel", "amd", or `null` if the
     * platform exposes IOMMU but we cannot determine the vendor. We derive
     * it by inspecting /sys/class/iommu/STAR/{intel-iommu,amd-iommu}
     * (STAR = any directory entry).
     */
    type: "intel" | "amd" | null;
}

export interface VfioStatus {
    /** True if the `vfio-pci` driver directory is present (module loaded). */
    moduleLoaded: boolean;
    /**
     * True if vfio-pci is currently loaded OR a vfio-pci.ko file exists in
     * /lib/modules/$(uname -r) so a modprobe is expected to succeed.
     */
    moduleAvailable: boolean;
}

export interface GpuTopology {
    iommu: IommuStatus;
    vfio: VfioStatus;
    gpus: GpuDevice[];
    /**
     * Human-readable warnings raised during probing that the UI should
     * surface (e.g. "lspci not found", "unreadable sysfs"). Detection
     * never blocks on these — partial info is still useful.
     */
    warnings: string[];
}

// ---------------------------------------------------------------------------
// IOMMU
// ---------------------------------------------------------------------------

const IOMMU_GROUPS_DIR = "/sys/kernel/iommu_groups";

/**
 * Probe whether the kernel has activated the IOMMU. Cheap; just a
 * directory existence + readdir check. The directory only appears when
 * the IOMMU is both BIOS-enabled and the right kernel cmdline is set
 * (`intel_iommu=on` / `amd_iommu=on`).
 */
export async function detectIommu(): Promise<IommuStatus> {
    if (!existsSync(IOMMU_GROUPS_DIR)) {
        return { enabled: false, type: null };
    }
    try {
        const entries = await readdir(IOMMU_GROUPS_DIR);
        if (entries.length === 0) {
            return { enabled: false, type: null };
        }
        let type: "intel" | "amd" | null = null;
        try {
            const iommuClass = await readdir("/sys/class/iommu");
            for (const name of iommuClass) {
                if (existsSync(join("/sys/class/iommu", name, "intel-iommu"))) {
                    type = "intel";
                    break;
                }
                if (existsSync(join("/sys/class/iommu", name, "amd-iommu"))) {
                    type = "amd";
                    break;
                }
            }
        } catch {
            // /sys/class/iommu may not be readable on every kernel; non-fatal.
        }
        return { enabled: true, type };
    } catch {
        return { enabled: false, type: null };
    }
}

// ---------------------------------------------------------------------------
// vfio-pci module presence
// ---------------------------------------------------------------------------

export async function detectVfio(): Promise<VfioStatus> {
    const moduleLoaded = existsSync("/sys/bus/pci/drivers/vfio-pci");
    let moduleAvailable = moduleLoaded;
    if (!moduleAvailable) {
        try {
            const { stdout } = await execAsync(
                "find /lib/modules/$(uname -r) -name 'vfio-pci.ko*' -print -quit",
                { timeout: 2000 },
            );
            moduleAvailable = stdout.trim().length > 0;
        } catch {
            moduleAvailable = false;
        }
    }
    return { moduleLoaded, moduleAvailable };
}

// ---------------------------------------------------------------------------
// lspci parsing
// ---------------------------------------------------------------------------

/**
 * Parse the output of `lspci -nnk -D`. The `Kernel driver in use:` /
 * `Kernel modules:` fields are stable from pciutils 3.2.0 onward; we
 * parse by trimmed prefix to avoid grepping on decoration that may
 * shift between versions.
 */
export function parseLspci(raw: string): PciFunction[] {
    const lines = raw.split("\n");
    const out: PciFunction[] = [];
    // Match the leading "DDDD:BB:DD.F class [class-id]: vendor device [vid:did]"
    // line. Domain is optional in some lspci builds; we accept either.
    const headRe =
        /^([0-9a-fA-F]{4}:)?([0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-9a-fA-F])\s+([^\[]+)\[([0-9a-fA-F]{4})\]:\s+(.+?)\s+\[([0-9a-fA-F]{4}):([0-9a-fA-F]{4})\]/;

    let current: PciFunction | null = null;
    for (const rawLine of lines) {
        const line = rawLine.replace(/\s+$/, "");
        const m = headRe.exec(line);
        if (m) {
            if (current) out.push(current);
            current = {
                bdf: m[2],
                pciClass: m[3].trim(),
                vendorId: m[6].toLowerCase(),
                deviceId: m[7].toLowerCase(),
                name: m[5].trim(),
                currentDriver: null,
                kernelModules: [],
            };
            continue;
        }
        if (!current) continue;
        const trimmed = line.trim();
        if (trimmed.startsWith("Kernel driver in use:")) {
            current.currentDriver = trimmed.substring("Kernel driver in use:".length).trim();
        } else if (trimmed.startsWith("Kernel modules:")) {
            current.kernelModules = trimmed
                .substring("Kernel modules:".length)
                .trim()
                .split(",")
                .map(s => s.trim())
                .filter(Boolean);
        }
    }
    if (current) out.push(current);
    return out;
}

// ---------------------------------------------------------------------------
// IOMMU group resolution
// ---------------------------------------------------------------------------

/** Map BDF -> IOMMU group number by walking /sys/kernel/iommu_groups. */
async function buildIommuGroupMap(): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!existsSync(IOMMU_GROUPS_DIR)) return map;
    const groupDirs = await readdir(IOMMU_GROUPS_DIR);
    await Promise.all(
        groupDirs.map(async group => {
            const n = Number.parseInt(group, 10);
            if (Number.isNaN(n)) return;
            const devicesDir = join(IOMMU_GROUPS_DIR, group, "devices");
            try {
                const devs = await readdir(devicesDir);
                for (const dev of devs) {
                    // Strip the leading "DDDD:" domain so it matches lspci
                    // output that omits the domain.
                    const stripped = dev.replace(/^[0-9a-fA-F]{4}:/, "");
                    map.set(stripped, n);
                    map.set(dev, n); // also keep the fully-qualified form
                }
            } catch {
                // group may have been removed between readdir and read; ignore.
            }
        }),
    );
    return map;
}

// ---------------------------------------------------------------------------
// SR-IOV attributes
// ---------------------------------------------------------------------------

async function readSriov(bdf: string): Promise<{ total: number; current: number }> {
    // PCI device sysfs dirs use the fully-qualified "0000:BB:DD.F" name.
    const fqdn = bdf.length === 7 ? `0000:${bdf}` : bdf;
    const path = `/sys/bus/pci/devices/${fqdn}`;
    const readNum = async (name: string): Promise<number> => {
        try {
            const s = await readFile(join(path, name), "utf-8");
            return Number.parseInt(s.trim(), 10) || 0;
        } catch {
            return 0;
        }
    };
    return {
        total: await readNum("sriov_totalvfs"),
        current: await readNum("sriov_numvfs"),
    };
}

// ---------------------------------------------------------------------------
// GPU identification
// ---------------------------------------------------------------------------

/** PCI class "03xx" — Display controller (covers VGA, 3D, and Other Display). */
const PCI_CLASS_DISPLAY = /^Display|^VGA|^3D/i;

function classifyVendor(vendorId: string): GpuVendor {
    const v = vendorId.toLowerCase();
    if (v === PCI_VENDOR.NVIDIA) return "NVIDIA";
    if (v === PCI_VENDOR.AMD) return "AMD";
    if (v === PCI_VENDOR.INTEL) return "INTEL";
    return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * One-shot host probe. Safe to call without elevation. Returns a complete
 * `GpuTopology` describing every GPU and its IOMMU group, plus the IOMMU /
 * VFIO subsystem state.
 *
 * Designed for repeated invocation (e.g. the prereq screen poll loop or
 * the Config UI panel). Total cost on a typical desktop: one `lspci`
 * fork plus < 30 sysfs reads.
 */
export async function detectGpuTopology(): Promise<GpuTopology> {
    const warnings: string[] = [];

    const [iommu, vfio] = await Promise.all([detectIommu(), detectVfio()]);

    let lspciOut: string;
    try {
        const { stdout } = await execAsync("lspci -nnk -D", { timeout: 5000 });
        lspciOut = stdout;
    } catch (e) {
        warnings.push(
            `lspci failed: ${(e as Error).message}. Install pciutils to enable GPU passthrough detection.`,
        );
        return { iommu, vfio, gpus: [], warnings };
    }

    const allFunctions = parseLspci(lspciOut);
    const displayFunctions = allFunctions.filter(f => PCI_CLASS_DISPLAY.test(f.pciClass));

    if (displayFunctions.length === 0) {
        warnings.push("No display-class PCI functions found in lspci output.");
        return { iommu, vfio, gpus: [], warnings };
    }

    const groupMap = await buildIommuGroupMap();

    const gpus: GpuDevice[] = [];
    for (const primary of displayFunctions) {
        const group = groupMap.get(primary.bdf);
        // Without IOMMU enabled we still report the GPU, but with group=-1.
        // Phase 1 viability requires iommu.enabled && group !== undefined.
        const groupNum = group ?? -1;
        const sriov = await readSriov(primary.bdf);

        // Group members - any other PCI function in the same group.
        const groupMembers: PciFunction[] = [];
        if (group !== undefined) {
            for (const fn of allFunctions) {
                if (groupMap.get(fn.bdf) === group) {
                    groupMembers.push(fn);
                }
            }
        }

        // "Isolated" = only this GPU's own functions are in the group. We
        // treat the GPU as isolated when every group member shares the same
        // bus+device as the primary (i.e. only the function number differs).
        // This handles the common "GPU = VGA fn.0 + HDMI audio fn.1" case.
        const [busDevPrimary] = primary.bdf.split(".");
        const isolated = groupMembers.every(fn => fn.bdf.startsWith(`${busDevPrimary}.`));

        gpus.push({
            primary,
            iommuGroup: groupNum,
            groupMembers,
            vendor: classifyVendor(primary.vendorId),
            isolated,
            sriovTotalVfs: sriov.total,
            sriovNumVfs: sriov.current,
        });
    }

    return { iommu, vfio, gpus, warnings };
}

// ---------------------------------------------------------------------------
// Convenience helpers consumed by the UI / config layer
// ---------------------------------------------------------------------------

/**
 * True iff `topology` is sufficient to *attempt* Phase 1 VFIO passthrough.
 * Does NOT guarantee passthrough will succeed at runtime — only that the
 * prerequisites are present.
 */
export function isPassthroughEligible(topology: GpuTopology): boolean {
    return (
        topology.iommu.enabled &&
        topology.vfio.moduleAvailable &&
        topology.gpus.some(g => g.iommuGroup >= 0 && g.isolated)
    );
}

/** Human-readable label, e.g. "NVIDIA GeForce RTX 3080 (03:00.0)". */
export function describeGpu(g: GpuDevice): string {
    const prefix = g.vendor === "UNKNOWN" ? "" : `${g.vendor} `;
    return `${prefix}${g.primary.name} (${g.primary.bdf})`.trim();
}

/**
 * Tiny barrier so a caller can avoid using a passthrough configuration
 * that references a BDF that no longer exists (cold-boot reorder, USB-C
 * dock, etc.).
 */
export async function bdfExists(bdf: string): Promise<boolean> {
    const fqdn = bdf.length === 7 ? `0000:${bdf}` : bdf;
    try {
        const st = await stat(`/sys/bus/pci/devices/${fqdn}`);
        return st.isDirectory();
    } catch {
        return false;
    }
}

// Internal exports for unit tests.
export const __test__ = {
    parseLspci,
    classifyVendor,
    PCI_CLASS_DISPLAY,
};
