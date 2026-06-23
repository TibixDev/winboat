/**
 * sriov.ts — Phase 2 thin TS wrapper around the helper's SR-IOV
 * subcommands. Symmetrical with vfio.ts; reuses runHelper.
 *
 * Why an ACTIVE write probe?
 *
 *   The PCI SR-IOV capability bits (sriov_totalvfs, sriov_offset, etc.)
 *   are populated by the kernel from the device's PCIe config space and
 *   are present even when the driver hasn't implemented sriov_configure.
 *   The two cases that matter to WinBoat are:
 *
 *     - i915 (pre-Xe Intel iGPU): sriov_totalvfs reports a non-zero VF
 *       count, but writing to sriov_numvfs either fails with -EINVAL or
 *       silently no-ops. A passive read lies; the probe writes "1",
 *       reads back, and reports failure if the read returns 0 or the
 *       write errored.
 *
 *     - Xe (modern Intel iGPU): the driver implements sriov_configure
 *       BUT only when the kernel was booted with `xe.max_vfs=N`. Without
 *       it, writes also fail. The same probe detects this.
 *
 *   The probe restores sriov_numvfs to its prior value before returning,
 *   so it has no observable side effect on a host whose driver supports
 *   SR-IOV correctly.
 *
 * References:
 *   - https://docs.kernel.org/PCI/pci-iov-howto.html
 *   - https://www.kernel.org/doc/html/latest/gpu/xe/xe_sriov.html
 */

import { runHelper, type HelperResult } from "./vfio";

/** Extra fields the helper attaches for SR-IOV subcommands. */
export interface SriovHelperResult extends HelperResult {
    sriov_total_vfs?: number;
    sriov_num_vfs?: number;
    sriov_supported?: boolean;
}

/** Cheap, unprivileged read of sriov_totalvfs / sriov_numvfs. */
export async function getSriovStatus(bdf: string): Promise<SriovHelperResult> {
    return runHelper("sriov-status", [`--bdf=${bdf}`], { unprivileged: true });
}

/**
 * Active write-probe. Returns sriov_supported=true iff the driver
 * implements sriov_configure such that a write of "1" to sriov_numvfs
 * is honoured. Restores prior value before returning.
 *
 * NOTE: this REQUIRES privileged execution (uses pkexec). Callers
 * should invoke it sparingly — at most once per GPU per session,
 * typically from the GPU detector or the SR-IOV config UI.
 */
export async function probeSriovSupport(bdf: string): Promise<SriovHelperResult> {
    return runHelper("sriov-probe", [`--bdf=${bdf}`]);
}

/**
 * Set sriov_numvfs to `numVfs`. Pre-zeroes if a different non-zero
 * value is currently set (some drivers require this). `numVfs=0`
 * disables SR-IOV (releases all VFs).
 */
export async function configureSriov(bdf: string, numVfs: number): Promise<SriovHelperResult> {
    if (!Number.isInteger(numVfs) || numVfs < 0) {
        throw new RangeError(`numVfs must be a non-negative integer (got ${numVfs})`);
    }
    return runHelper("sriov-configure", [`--bdf=${bdf}`, `--numvfs=${numVfs}`]);
}
