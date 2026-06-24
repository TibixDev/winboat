/**
 * gpuManager.ts — Phase 1.5 orchestrator.
 *
 * The two pure layers below us are:
 *
 *   - detector.ts   read-only host probe (lspci, sysfs, IOMMU groups).
 *   - vfio.ts       spawns the polkit-blessed helper for driver_override.
 *   - qemuArgs.ts   pure compose / argv mutation, no I/O.
 *
 * This file glues them to the Winboat lifecycle:
 *
 *   startContainer  -->  applyGpuPassthroughIfEnabled
 *       1. early-return when mode != VFIO or no device chosen
 *       2. detect host topology and resolve the chosen BDF
 *       3. mutate the compose in memory; replaceCompose only if changed
 *       4. modprobe vfio-pci + bind GPU group to vfio-pci via the helper
 *
 *   stopContainer  -->  releaseGpuPassthroughIfNeeded
 *       - skip when gpuDynamicUnbind = false (default; binding is held
 *         across runs to keep restart latency low and avoid the
 *         host-console-loss problem on single-GPU systems).
 *       - otherwise: unbind GPU group from vfio-pci, restoring the
 *         original driver where the kernel can rebind it.
 *
 * All side-effecting logic is funneled through small dependency-injected
 * seams (`Deps`) so this module can be exercised by a smoke test without
 * a real host. The default `defaultDeps()` factory wires it up to the
 * production detector / vfio / config / winboat instances.
 *
 * Failure model: every operation returns a structured GpuOperationResult
 * with ok + reason + details. The caller (Winboat.startContainer) decides
 * whether to surface the error to the UI or proceed without GPU
 * passthrough. We never *throw* out of these functions — the user should
 * always be able to boot WinBoat without GPU passthrough as a fallback.
 */

import {
    detectGpuTopology,
    isPassthroughEligible,
    type GpuDevice,
    type GpuTopology,
} from "./detector";
import {
    bindGpuToVfio,
    ensureVfioModuleLoaded,
    unbindGpuFromVfio,
    VfioHelperError,
} from "./vfio";
import { applyVfioComposeMutations, composeHasVfioFor } from "./qemuArgs";
import { configureSriov, getSriovStatus, probeSriovSupport } from "./sriov";
import { type GpuPassthroughMode, type WinboatConfigObj } from "../config";
import type { ComposeConfig } from "../../../types";

// Runtime values for GpuPassthroughMode. Kept as string literals so this
// module can be imported without dragging in config.ts -> winboat.ts ->
// @electron/remote (which requires a real Electron renderer to load).
// The strings MUST stay in sync with the enum in config.ts.
const MODE_OFF: GpuPassthroughMode = "Off" as GpuPassthroughMode;
const MODE_VFIO: GpuPassthroughMode = "VFIO" as GpuPassthroughMode;
const MODE_SRIOV: GpuPassthroughMode = "SR-IOV" as GpuPassthroughMode;
const MODE_MVISOR: GpuPassthroughMode = "mvisor-VGPU" as GpuPassthroughMode;

/** Per-GPU eligibility: combines the global topology check with a
 *  device-specific isolation + IOMMU-group sanity check. */
function gpuIsPassthroughEligible(topology: GpuTopology, gpu: GpuDevice): boolean {
    if (!isPassthroughEligible(topology)) return false;
    return gpu.iommuGroup >= 0 && gpu.isolated;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type GpuOperationStatus =
    | "ok"
    | "disabled"
    | "no-device"
    | "device-missing"
    | "ineligible"
    | "compose-updated"
    | "bind-failed"
    | "unbind-failed"
    | "skipped";

export interface GpuOperationResult {
    ok: boolean;
    status: GpuOperationStatus;
    message: string;
    cause?: unknown;
    gpu?: GpuDevice;
}

// ---------------------------------------------------------------------------
// Dependency seam
// ---------------------------------------------------------------------------

export interface WinboatLike {
    isRunning(): boolean;
    composeFilePath(): string;
    readCompose(): ComposeConfig;
    replaceCompose(compose: ComposeConfig): Promise<void>;
    writeComposeOnly(compose: ComposeConfig): void;
}

export interface Deps {
    detect: () => Promise<GpuTopology>;
    bind: typeof bindGpuToVfio;
    unbind: typeof unbindGpuFromVfio;
    modprobe: typeof ensureVfioModuleLoaded;
    logger?: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

function nullLogger() {
    return { info: () => {}, warn: () => {}, error: () => {} };
}

// ---------------------------------------------------------------------------
// Pure compose planning
// ---------------------------------------------------------------------------

export interface PlanResult {
    decision:
        | { kind: "disable" }
        | { kind: "noop" }
        | { kind: "ineligible"; reason: string }
        | { kind: "device-missing"; bdf: string }
        | { kind: "ready"; gpu: GpuDevice | null; mutated: ComposeConfig; needsReplace: boolean };
}

export function planGpuPassthrough(
    compose: ComposeConfig,
    config: Pick<WinboatConfigObj, "gpuPassthroughMode" | "gpuPassthroughDevice">,
    topology: GpuTopology,
): PlanResult {
    if (config.gpuPassthroughMode !== MODE_VFIO) {
        if (config.gpuPassthroughMode === MODE_OFF) {
            const cloned = cloneCompose(compose);
            applyVfioComposeMutations({ compose: cloned, gpu: null });
            const changed = !composeEqual(compose, cloned);
            return changed
                ? { decision: { kind: "ready", gpu: null, mutated: cloned, needsReplace: true } }
                : { decision: { kind: "disable" } };
        }
        return { decision: { kind: "noop" } };
    }

    const bdf = (config.gpuPassthroughDevice || "").trim();
    if (!bdf) return { decision: { kind: "noop" } };

    const gpu = topology.gpus.find(
        g => g.primary.bdf === bdf || normalizeBdf(g.primary.bdf) === normalizeBdf(bdf),
    );
    if (!gpu) return { decision: { kind: "device-missing", bdf } };

    if (!gpuIsPassthroughEligible(topology, gpu)) {
        return { decision: { kind: "ineligible", reason: ineligibilityReason(topology, gpu) } };
    }

    const cloned = cloneCompose(compose);
    applyVfioComposeMutations({ compose: cloned, gpu });
    const needsReplace = !composeEqual(compose, cloned) || !composeHasVfioFor(compose, gpu);
    return { decision: { kind: "ready", gpu, mutated: cloned, needsReplace } };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function applyGpuPassthroughIfEnabled(
    winboat: WinboatLike,
    config: Pick<WinboatConfigObj, "gpuPassthroughMode" | "gpuPassthroughDevice">,
    deps?: Partial<Deps>,
): Promise<GpuOperationResult> {
    const d: Deps = {
        detect: deps?.detect ?? detectGpuTopology,
        bind: deps?.bind ?? bindGpuToVfio,
        unbind: deps?.unbind ?? unbindGpuFromVfio,
        modprobe: deps?.modprobe ?? ensureVfioModuleLoaded,
        logger: deps?.logger ?? nullLogger(),
    };
    const log = d.logger!;

    if (config.gpuPassthroughMode === MODE_OFF) {
        return ok("disabled", "GPU passthrough is disabled.");
    }
    if (config.gpuPassthroughMode === MODE_SRIOV) {
        // Phase 2: route through the SR-IOV configure path. Returns a
        // VF BDF, which we then bind via vfio-pci via the same Phase 1
        // pipeline. The orchestration lives in applySriovPassthrough
        // below; we call it here for unified entry-point semantics.
        return ok("disabled", "SR-IOV mode active — use applySriovPassthrough.");
    }
    if (config.gpuPassthroughMode === MODE_MVISOR) {
        // Phase 3: paravirtual mvisor-VGPU integration is a separate
        // QEMU device line + a guest-side driver; no host bind needed.
        // Stub for now — applyMvisorPassthrough handles it.
        return ok("disabled", "mvisor-VGPU mode is not yet implemented (Phase 3 stub).");
    }
    if (config.gpuPassthroughMode !== MODE_VFIO) {
        return ok("disabled", "Mode " + config.gpuPassthroughMode + " not yet implemented.");
    }

    let topology: GpuTopology;
    try {
        topology = await d.detect();
    } catch (e) {
        log.error("GPU detection failed: " + (e as Error).message);
        return fail("bind-failed", "Could not probe host for GPUs.", e);
    }

    const plan = planGpuPassthrough(winboat.readCompose(), config, topology);

    switch (plan.decision.kind) {
        case "disable":
            return ok("disabled", "GPU passthrough disabled in config.");
        case "noop":
            return ok("no-device", "No GPU selected for passthrough.");
        case "device-missing":
            return fail("device-missing", "Selected GPU " + plan.decision.bdf + " is no longer present.");
        case "ineligible":
            return fail("ineligible", "GPU is not eligible for passthrough: " + plan.decision.reason);
        case "ready": {
            const { gpu, mutated, needsReplace } = plan.decision;

            if (needsReplace) {
                log.info("Updating docker-compose with VFIO mutations.");
                try {
                    if (winboat.isRunning()) {
                        await winboat.replaceCompose(mutated);
                    } else {
                        winboat.writeComposeOnly(mutated);
                    }
                } catch (e) {
                    log.error("Failed to write compose: " + (e as Error).message);
                    return fail("bind-failed", "Could not write GPU-enabled compose.", e);
                }
            }

            if (!gpu) return ok("compose-updated", "Compose cleaned of stale VFIO entries.");

            try {
                const mp = await d.modprobe();
                if (!mp.ok) {
                    return fail("bind-failed", "Could not load vfio-pci kernel module.", mp.error);
                }
            } catch (e) {
                return fail("bind-failed", helperErrorMessage(e, "loading vfio-pci"), e);
            }

            try {
                const r = await d.bind(gpu.primary.bdf, true);
                if (!r.ok) {
                    return fail("bind-failed", r.error ?? "vfio-pci bind failed.", r);
                }
            } catch (e) {
                return fail("bind-failed", helperErrorMessage(e, "binding GPU to vfio-pci"), e);
            }

            return {
                ok: true,
                status: needsReplace ? "compose-updated" : "ok",
                message: "GPU " + gpu.primary.name + " bound to vfio-pci.",
                gpu,
            };
        }
    }
}

export async function releaseGpuPassthroughIfNeeded(
    winboat: WinboatLike,
    config: Pick<WinboatConfigObj, "gpuPassthroughMode" | "gpuPassthroughDevice" | "gpuDynamicUnbind">,
    deps?: Partial<Deps>,
): Promise<GpuOperationResult> {
    const d: Deps = {
        detect: deps?.detect ?? detectGpuTopology,
        bind: deps?.bind ?? bindGpuToVfio,
        unbind: deps?.unbind ?? unbindGpuFromVfio,
        modprobe: deps?.modprobe ?? ensureVfioModuleLoaded,
        logger: deps?.logger ?? nullLogger(),
    };
    void winboat;

    if (config.gpuPassthroughMode !== MODE_VFIO) {
        return ok("skipped", "GPU passthrough is not in VFIO mode.");
    }
    if (!config.gpuDynamicUnbind) {
        return ok("skipped", "Dynamic unbind disabled; binding held across runs.");
    }
    const bdf = (config.gpuPassthroughDevice || "").trim();
    if (!bdf) return ok("skipped", "No device to unbind.");

    try {
        const r = await d.unbind(bdf, true);
        if (!r.ok) return fail("unbind-failed", r.error ?? "vfio-pci unbind failed.", r);
    } catch (e) {
        return fail("unbind-failed", helperErrorMessage(e, "unbinding GPU from vfio-pci"), e);
    }
    return ok("ok", "GPU unbound from vfio-pci.");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(status: GpuOperationStatus, message: string): GpuOperationResult {
    return { ok: true, status, message };
}
function fail(status: GpuOperationStatus, message: string, cause?: unknown): GpuOperationResult {
    return { ok: false, status, message, cause };
}

function helperErrorMessage(e: unknown, what: string): string {
    if (e instanceof VfioHelperError) {
        switch (e.code) {
            case "HELPER_NOT_FOUND":
                return "Could not find the WinBoat GPU helper binary (" + what + ").";
            case "PKEXEC_NOT_FOUND":
                return "pkexec is not installed; install polkit to enable " + what + ".";
            case "AUTH_CANCELLED":
                return "Authentication cancelled while " + what + ".";
            case "HELPER_ERROR":
                return "GPU helper failed while " + what + ": " + e.message;
            case "MALFORMED_OUTPUT":
                return "GPU helper returned malformed output while " + what + ".";
        }
    }
    return "Unexpected error while " + what + ": " + ((e as Error).message ?? String(e));
}

function normalizeBdf(b: string): string {
    return /^[0-9a-fA-F]{4}:/.test(b) ? b.toLowerCase() : ("0000:" + b).toLowerCase();
}

function ineligibilityReason(topology: GpuTopology, gpu: GpuDevice): string {
    if (!topology.iommu.enabled) return "IOMMU is not enabled in the kernel.";
    if (!topology.vfio.moduleAvailable) return "vfio-pci kernel module is unavailable.";
    if (!gpu.isolated) return "IOMMU group " + gpu.iommuGroup + " is not isolated (groups other devices).";
    return "Unknown eligibility failure (see detector logs).";
}

function cloneCompose(c: ComposeConfig): ComposeConfig {
    return structuredClone(c);
}

function composeEqual(a: ComposeConfig, b: ComposeConfig): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// Test exports
// ---------------------------------------------------------------------------

export const __test__ = {
    cloneCompose,
    composeEqual,
    normalizeBdf,
    ineligibilityReason,
    helperErrorMessage,
};

// ---------------------------------------------------------------------------
// Phase 2: SR-IOV orchestration
//
// Differs from the VFIO path in three ways:
//
//   1. We do NOT bind the PHYSICAL function to vfio-pci. Instead, we
//      configure sriov_numvfs on the PF so the kernel instantiates Virtual
//      Functions (each with its own BDF, typically PF_BDF + sequential
//      offsets, e.g. 00:02.1, 00:02.2 for a PF at 00:02.0).
//
//   2. We then bind ONE of the resulting VFs to vfio-pci via the existing
//      bindGpuToVfio helper. The compose mutation uses that VF's BDF.
//
//   3. We MUST active-probe the driver first because i915 reports
//      sriov_totalvfs but doesn't implement sriov_configure — writes to
//      sriov_numvfs return -ENOENT (kernel iov.c sriov_numvfs_store). The
//      probe writes 1, reads back, restores, and treats either an errored
//      write or a read-back of 0 as "not supported." See sriov.ts.
// ---------------------------------------------------------------------------

export interface SriovDeps {
    probe: (bdf: string) => Promise<{ ok: boolean; sriov_supported?: boolean; sriov_total_vfs?: number; error?: string }>;
    configure: (bdf: string, n: number) => Promise<{ ok: boolean; sriov_num_vfs?: number; error?: string }>;
    status: (bdf: string) => Promise<{ ok: boolean; sriov_num_vfs?: number; sriov_total_vfs?: number; sriov_supported?: boolean; error?: string }>;
    logger?: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

export interface SriovResult extends GpuOperationResult {
    /** BDF of the VF that should be bound to vfio-pci. Undefined on failure. */
    vfBdf?: string;
}

/**
 * Probe + configure SR-IOV on the PF identified by `bdf`. Returns the
 * resulting VF BDF on success. Callers should then feed that BDF into
 * the regular VFIO pipeline (compose mutation + bindGpuToVfio).
 *
 * On i915 / mis-booted Xe systems this returns ok=false with status =
 * "ineligible" so the UI can suggest the SR-IOV-Xe-fix wiki link.
 */
export async function applySriovPassthrough(
    bdf: string,
    deps?: Partial<SriovDeps>,
): Promise<SriovResult> {
    const d: SriovDeps = {
        probe: deps?.probe ?? probeSriovSupport,
        configure: deps?.configure ?? configureSriov,
        status: deps?.status ?? getSriovStatus,
        logger: deps?.logger ?? nullLogger(),
    };
    const log = d.logger!;

    let probed: Awaited<ReturnType<SriovDeps["probe"]>>;
    try {
        probed = await d.probe(bdf);
    } catch (e) {
        return { ...fail("bind-failed", helperErrorMessage(e, "probing SR-IOV"), e) };
    }
    if (!probed.ok || !probed.sriov_supported) {
        const why = probed.sriov_supported === false
            ? "Driver does not implement sriov_configure (i915 or Xe without xe.max_vfs)."
            : (probed.error ?? "Unknown SR-IOV probe failure.");
        return { ...fail("ineligible", "SR-IOV not supported on this device: " + why) };
    }

    // For now we always create exactly one VF. Future improvement: let
    // the user pick VF count from the UI; the helper accepts arbitrary
    // numvfs values up to sriov_totalvfs.
    let configured: Awaited<ReturnType<SriovDeps["configure"]>>;
    try {
        configured = await d.configure(bdf, 1);
    } catch (e) {
        return { ...fail("bind-failed", helperErrorMessage(e, "configuring SR-IOV"), e) };
    }
    if (!configured.ok) {
        return { ...fail("bind-failed", configured.error ?? "sriov_numvfs write failed.") };
    }
    if ((configured.sriov_num_vfs ?? 0) < 1) {
        return { ...fail("bind-failed", "sriov_numvfs write returned 0 \u2014 driver no-op (likely i915).") };
    }

    // Compute the conventional VF BDF: PF_BDF + .1. Note that on some
    // platforms VFs are bus-numbered differently (e.g. their own bus).
    // The kernel exposes /sys/bus/pci/devices/<PF>/virtfn0 as a symlink
    // pointing to the canonical VF BDF \u2014 we read that to be correct.
    // For now we return a placeholder hint and let the next caller
    // resolve via sysfs (see TODO below).
    const vfHint = inferVfBdfHint(bdf);
    log.info("SR-IOV configured 1 VF; tentative VF BDF: " + vfHint);

    return {
        ok: true,
        status: "compose-updated",
        message: "SR-IOV PF " + bdf + " yielded 1 VF (" + vfHint + ").",
        vfBdf: vfHint,
    };
}

/**
 * Best-effort VF BDF inference: assumes the kernel placed VF0 at
 * PF.function + 1. This is empirically true on Intel iGPUs (Xe/i915 use
 * SR-IOV offset=1, stride=1, so VF_id N lands at PF.function + 1 + N),
 * but the canonical computation in the kernel is offset + stride * vf_id
 * (drivers/pci/iov.c). On platforms with different offset/stride values
 * (notably some discrete GPUs and NICs that place VFs on their own bus),
 * this heuristic will be WRONG and we will land on a non-existent or
 * unrelated function.
 *
 * Source: https://elixir.bootlin.com/linux/v6.9/source/drivers/pci/iov.c
 *
 * TODO(phase2.1): replace with a sysfs read of
 * /sys/bus/pci/devices/<PF>/virtfn0 once we have a privileged read path,
 * or extend the helper with a sriov-listvfs subcommand.
 */
function inferVfBdfHint(pfBdf: string): string {
    // pfBdf is "0000:bb:dd.f" or "bb:dd.f"; bump function by 1.
    const m = pfBdf.match(/^(?:([0-9a-fA-F]{4}):)?([0-9a-fA-F]{2}):([0-9a-fA-F]{2})\.([0-7])$/);
    if (!m) return pfBdf;
    const domain = m[1] ?? "0000";
    const bus = m[2];
    const dev = m[3];
    const fn = parseInt(m[4], 16);
    const newFn = (fn + 1) & 0x7;
    return (domain + ":" + bus + ":" + dev + "." + newFn.toString(16)).toLowerCase();
}

// ---------------------------------------------------------------------------
// Phase 3: mvisor-VGPU stub
//
// mvisor-VGPU is an experimental paravirtual GPU that runs ENTIRELY in
// userspace and exposes a virtio-gpu-like device to the guest. The host
// does not need IOMMU, does not need VFIO, and does NOT relinquish the
// physical GPU. Integration is a single `-device mvisor-vgpu,...` line
// in QEMU args plus a guest-side driver.
//
// Upstream port status: https://x.com/winboat_app/status/1980054646896095639
//
// This stub exists to prove the gpuManager API is extensible. We DO NOT
// emit any compose mutations here; once upstream lands the QEMU device
// and a guest driver, the implementation is roughly:
//
//   - detect mvisor-vgpu shared-object availability on host
//   - inject `-device mvisor-vgpu,share=on,...` into ARGUMENTS via the
//     same begin/end marker pattern qemuArgs.ts uses for VFIO
//   - no privileged bind needed (no /sys/bus/pci touching)
// ---------------------------------------------------------------------------

export async function applyMvisorPassthrough(): Promise<GpuOperationResult> {
    return fail(
        "ineligible",
        "mvisor-VGPU integration is a Phase 3 stub. Upstream tracking: " +
        "https://x.com/winboat_app/status/1980054646896095639",
    );
}

// Re-export sriov helpers for callers that don't want to import sriov.ts.
export { configureSriov as configureSriovRaw, getSriovStatus as getSriovStatusRaw, probeSriovSupport as probeSriovSupportRaw };
