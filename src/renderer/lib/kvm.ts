/**
 * KVM device access probe for WinBoat preflight.
 *
 * Checks that /dev/kvm exists and can be opened O_RDWR by the current user.
 * This is intentionally NOT a full KVM capability / ioctl validation
 * (e.g. KVM_GET_API_VERSION). Architecture names and x86-only CPU flags
 * (vmx/svm) are never consulted — ARM hosts with KVM work the same path.
 */

const fs: typeof import("fs") = require("node:fs");

export type KvmAccessProbe = {
    kvmDeviceExists: boolean;
    canOpenRdwr: boolean;
};

export type KvmProbeDeps = {
    devicePath?: string;
    existsSync?: (path: string) => boolean;
    openSync?: (path: string, flags: number) => number;
    closeSync?: (fd: number) => void;
    oRdwr?: number;
};

/**
 * Decide whether KVM is usable for WinBoat preflight.
 * Requires a present device that the process can open O_RDWR.
 */
export function evaluateKvmEnabled(probe: KvmAccessProbe): boolean {
    return probe.kvmDeviceExists && probe.canOpenRdwr;
}

/**
 * Probe /dev/kvm via real O_RDWR open. Always closes the fd in finally when open succeeded.
 * Does not run KVM ioctls — open success only.
 */
export function probeKvmDeviceAccess(deps: KvmProbeDeps = {}): KvmAccessProbe {
    const devicePath = deps.devicePath ?? "/dev/kvm";
    const existsSync = deps.existsSync ?? ((p: string) => fs.existsSync(p));
    const openSync = deps.openSync ?? ((p: string, flags: number) => fs.openSync(p, flags));
    const closeSync = deps.closeSync ?? ((fd: number) => fs.closeSync(fd));
    const oRdwr = deps.oRdwr ?? fs.constants.O_RDWR;

    const kvmDeviceExists = existsSync(devicePath);
    if (!kvmDeviceExists) {
        return { kvmDeviceExists: false, canOpenRdwr: false };
    }

    let fd: number | undefined;
    try {
        fd = openSync(devicePath, oRdwr);
        return { kvmDeviceExists: true, canOpenRdwr: true };
    } catch {
        return { kvmDeviceExists: true, canOpenRdwr: false };
    } finally {
        if (fd !== undefined) {
            closeSync(fd);
        }
    }
}
