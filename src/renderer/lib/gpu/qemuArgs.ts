/**
 * qemuArgs.ts — pure functions that produce the QEMU command-line
 * fragments and docker-compose mutations needed for VFIO PCIe passthrough.
 *
 * These functions intentionally do NOT touch the filesystem or invoke any
 * external commands. They're pure transforms over the in-memory
 * ComposeConfig + a GpuDevice. Everything privileged (driver_override
 * writes, modprobe vfio-pci, etc.) lives in vfio.ts; everything that
 * orchestrates start / stop lifecycles lives in gpuManager.ts (Phase 1.5).
 *
 * Splitting it this way lets us unit-test the compose mutation without
 * needing a real host with PCIe passthrough.
 *
 * Source-of-truth references (all primary):
 *
 *   - QEMU vfio-pci device options (multifunction, x-vga, romfile, etc.):
 *     https://www.qemu.org/docs/master/system/devices/vfio.html
 *   - vfio-pci-nohotplug vs vfio-pci:
 *     https://lore.kernel.org/qemu-devel/20180405200627.31466-3-alex.williamson@redhat.com/
 *     The -nohotplug variant disables the migration-time hot-unplug code
 *     path that, for a primary-display GPU, would otherwise refuse to
 *     start because the device has been kept marked "in-use" by the
 *     host's framebuffer console.
 *   - x-vga=on: required when the passed-through GPU is the guest's
 *     primary display \u2014 instructs QEMU to forward VGA-class quirks
 *     (legacy VGA windows, ROM stitching) needed for boot-time output.
 *   - multifunction=on: declares the QEMU PCI slot as multifunction so
 *     the GPU's audio function (typically .1) can be exposed alongside
 *     the VGA function (.0) on the same virtual slot.
 *   - dockur/windows ARGUMENTS env: appended verbatim to QEMU's argv.
 *     See https://github.com/dockur/windows#advanced-settings.
 */

import type { ComposeConfig } from "../../../types";
import type { GpuDevice } from "./detector";

/** Marker string we use to wrap the auto-generated vfio block. Lets us
 *  re-write the block idempotently when the user re-saves config. */
export const VFIO_ARG_MARKER_BEGIN = "# >>> winboat vfio-pci begin (auto-generated; do not edit by hand) >>>";
export const VFIO_ARG_MARKER_END = "# <<< winboat vfio-pci end <<<";

/** Compose volume / device / cap entries we manage for VFIO passthrough.
 *  Listed here so addVfioCompose / removeVfioCompose stay in lockstep. */
const VFIO_CHARDEV = "/dev/vfio/vfio:/dev/vfio/vfio";
const VFIO_GROUP_DEV_PREFIX = "/dev/vfio/"; // followed by the IOMMU group number

/**
 * Build the additional `-device vfio-pci-nohotplug,...` argv fragments
 * for a passed-through GPU.
 *
 * We emit one -device entry per IOMMU group member (you must pass them
 * all through together \u2014 see the VFIO model docs). The primary VGA
 * function gets x-vga=on,multifunction=on; secondary functions only get
 * the bus address.
 *
 * The `host` field is normalised to the full DDDD:BB:DD.F form because
 * QEMU's vfio-pci accepts both but is unambiguous with the longer form.
 *
 * Example output for an NVIDIA card on 03:00.0 / 03:00.1:
 *
 *   -device vfio-pci-nohotplug,host=0000:03:00.0,multifunction=on,x-vga=on,bus=pcie.0,addr=0x10
 *   -device vfio-pci-nohotplug,host=0000:03:00.1,bus=pcie.0,addr=0x10.0x1
 *
 * The bus / addr fields are intentionally fixed at pcie.0 / 0x10 because
 * dockur/windows uses Q35 with a known stable PCIe root. Future
 * improvement: detect the next free addr by parsing existing -device
 * lines, but for now 0x10 is well clear of dockur's own additions.
 */
export interface BuildVfioArgsInput {
    gpu: GpuDevice;
    /** Pass through *every* group member, not just the primary. Almost
     *  always true; an isolated GPU group typically has 2-3 members
     *  (VGA + audio + sometimes USB-C). */
    includeGroupMembers?: boolean;
}

export interface BuildVfioArgsResult {
    /** Argv fragments to append to ARGUMENTS. */
    qemuArgs: string[];
    /** IOMMU group number, or -1 if not under an IOMMU. */
    iommuGroup: number;
    /** BDFs that the compose file must expose via /dev/vfio/. */
    affectedBdfs: string[];
}

/**
 * Pure: build the argv fragments for a single GPU. Does NOT mutate.
 */
export function buildVfioQemuArgs(input: BuildVfioArgsInput): BuildVfioArgsResult {
    const { gpu, includeGroupMembers = true } = input;
    const members = includeGroupMembers ? gpu.groupMembers : [gpu.primary];

    const args: string[] = [];
    let addrSubFunction = 0;
    for (const fn of members) {
        const isPrimary = fn.bdf === gpu.primary.bdf;
        const bdf = normaliseBdfLong(fn.bdf);
        // PCIe slot 0x10 is well clear of dockur/windows' own devices.
        // Multifunction lives at the same slot; sub-functions are at .1, .2, ...
        const slot = "0x10";
        const addr = isPrimary ? slot : `${slot}.0x${(++addrSubFunction).toString(16)}`;

        const parts = [
            "-device vfio-pci-nohotplug",
            `host=${bdf}`,
        ];
        if (isPrimary) {
            // Primary VGA function: declare multifunction + VGA quirks.
            parts.push("multifunction=on");
            // x-vga=on is only meaningful for VGA-class devices. We gate
            // it on the PCI class to avoid forwarding the flag to e.g.
            // the GPU's HDMI audio function (class 0403).
            if (isVgaClass(fn.pciClass)) parts.push("x-vga=on");
        }
        parts.push(`bus=pcie.0`, `addr=${addr}`);
        args.push(parts.join(","));
    }
    return {
        qemuArgs: args,
        iommuGroup: gpu.iommuGroup,
        affectedBdfs: members.map(fn => normaliseBdfLong(fn.bdf)),
    };
}

/**
 * Render the args into the single ARGUMENTS string dockur/windows wants,
 * wrapped in the begin/end marker so we can rewrite it idempotently.
 */
export function renderVfioArgumentsBlock(result: BuildVfioArgsResult): string {
    if (result.qemuArgs.length === 0) return "";
    const inner = result.qemuArgs.join("\n");
    return `${VFIO_ARG_MARKER_BEGIN}\n${inner}\n${VFIO_ARG_MARKER_END}`;
}

/**
 * Strip any previously-installed vfio block from an ARGUMENTS string.
 * Idempotent: input with no block is returned unchanged.
 */
export function stripVfioArgumentsBlock(args: string): string {
    if (!args) return args;
    // Greedy but safe: there should only ever be one block. If users
    // manually edited the file and the markers no longer match, we err
    // on the side of leaving their edits alone (regex returns no match
    // \u2192 input unchanged).
    const re = new RegExp(
        `\\n?${escapeRegex(VFIO_ARG_MARKER_BEGIN)}[\\s\\S]*?${escapeRegex(VFIO_ARG_MARKER_END)}\\n?`,
        "g",
    );
    return args.replace(re, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

// ---------------------------------------------------------------------------
// Compose mutation
// ---------------------------------------------------------------------------

/**
 * Apply VFIO compose mutations IN PLACE on `compose`. Idempotent: calling
 * twice with the same GPU produces the same result; passing `null` for
 * the GPU strips any prior VFIO mutations.
 *
 * Mutations applied (always under services.windows):
 *
 *   1. environment.ARGUMENTS  \u2014 append the rendered VFIO block.
 *   2. devices                \u2014 add /dev/vfio/<group> and /dev/vfio/vfio.
 *   3. cap_add                \u2014 ensure SYS_ADMIN is present. NOT SYS_RAWIO
 *                               (see Appendix B.6 of the dev plan).
 *
 * Removing mutations is the symmetric reverse. We do NOT remove cap_add
 * SYS_ADMIN on disable, because the container already runs privileged:
 * true and other features may rely on the cap; we treat caps as additive.
 */
export interface ApplyVfioComposeInput {
    compose: ComposeConfig;
    gpu: GpuDevice | null;
    includeGroupMembers?: boolean;
}

export function applyVfioComposeMutations(input: ApplyVfioComposeInput): void {
    const { compose, gpu, includeGroupMembers = true } = input;
    const svc = compose.services.windows;

    // --- 1. ARGUMENTS -------------------------------------------------------
    const prior = svc.environment.ARGUMENTS ?? "";
    const stripped = stripVfioArgumentsBlock(prior);

    if (!gpu) {
        svc.environment.ARGUMENTS = stripped;
        // Also strip the VFIO devices we manage.
        if (Array.isArray(svc.devices)) {
            svc.devices = svc.devices.filter(d => !isManagedVfioDevice(d));
        }
        return;
    }

    const built = buildVfioQemuArgs({ gpu, includeGroupMembers });
    const block = renderVfioArgumentsBlock(built);
    // Re-append with a clean newline separator. Trim avoids "\n\n\n" stacking.
    svc.environment.ARGUMENTS = stripped ? `${stripped.trimEnd()}\n${block}` : block;

    // --- 2. devices ---------------------------------------------------------
    if (!Array.isArray(svc.devices)) svc.devices = [];
    // Remove any prior VFIO entries before adding fresh ones; lets us cope
    // with the user switching to a GPU in a different IOMMU group.
    svc.devices = svc.devices.filter(d => !isManagedVfioDevice(d));
    svc.devices.push(VFIO_CHARDEV);
    if (built.iommuGroup >= 0) {
        const groupDev = `${VFIO_GROUP_DEV_PREFIX}${built.iommuGroup}:${VFIO_GROUP_DEV_PREFIX}${built.iommuGroup}`;
        svc.devices.push(groupDev);
    }

    // --- 3. cap_add ---------------------------------------------------------
    if (!Array.isArray(svc.cap_add)) svc.cap_add = [];
    if (!svc.cap_add.includes("SYS_ADMIN")) svc.cap_add.push("SYS_ADMIN");
    // Defensive: someone might have copy-pasted a guide and added SYS_RAWIO.
    // It's not needed for vfio-pci, just remove it so we don't accidentally
    // grant a power we don't use.
    svc.cap_add = svc.cap_add.filter(c => c !== "SYS_RAWIO");
}

/**
 * Convenience wrapper: returns true when the compose file already
 * declares VFIO mutations for the given GPU. Used by GpuManager to skip
 * a redundant `replaceCompose` call when nothing changed.
 */
export function composeHasVfioFor(compose: ComposeConfig, gpu: GpuDevice): boolean {
    const args = compose.services.windows.environment.ARGUMENTS ?? "";
    return args.includes(VFIO_ARG_MARKER_BEGIN) &&
        args.includes(`host=${normaliseBdfLong(gpu.primary.bdf)}`);
}

// ---------------------------------------------------------------------------
// Internal helpers (also exported under __test__ for direct testing)
// ---------------------------------------------------------------------------

function normaliseBdfLong(bdf: string): string {
    // Accept "BB:DD.F" or "DDDD:BB:DD.F"; return the latter.
    if (/^[0-9a-fA-F]{4}:/.test(bdf)) return bdf.toLowerCase();
    return `0000:${bdf}`.toLowerCase();
}

function isVgaClass(pciClass: string): boolean {
    // lspci emits human-readable strings; match the canonical 0300 / 0302
    // (VGA controller / 3D controller) classes. We accept either form.
    const lc = pciClass.toLowerCase();
    return (
        lc.includes("vga compatible controller") ||
        lc.includes("3d controller") ||
        lc.includes("display controller")
    );
}

function isManagedVfioDevice(device: string): boolean {
    // We only manage /dev/vfio/* entries that we ourselves write. Any
    // other devices entry (e.g. /dev/kvm, /dev/bus/usb) is left alone.
    // The user is free to add /dev/vfio/<N> manually; we will then
    // duplicate-add it on next save, which is harmless: docker-compose
    // de-duplicates identical device entries on container create.
    return device.startsWith(VFIO_GROUP_DEV_PREFIX) || device === VFIO_CHARDEV;
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Test exports
// ---------------------------------------------------------------------------

export const __test__ = {
    normaliseBdfLong,
    isVgaClass,
    isManagedVfioDevice,
};
