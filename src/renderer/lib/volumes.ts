const fs: typeof import("fs") = require("node:fs");
const os: typeof import("os") = require("node:os");
const path: typeof import("path") = require("node:path");

import type { CustomVolumeMount, ComposeConfig } from "../../types";

const SHARED_FOLDER_ROOT = "/shared";
const CUSTOM_SHARE_ROOT = "/shared2";
const STORAGE_SHARED_FOLDER_ROOT = "/storage/shared";
const LEGACY_CUSTOM_DATA_ROOT = "/data2";
const LEGACY_CUSTOM_MOUNT_BASE = "/mnt/winboat";
const LEGACY_SAMBA_MOUNT_BASE = "/tmp/smb";
const LEGACY_SINGLE_PATH_MOUNT = /^\/[a-zA-Z0-9_-]+$/;

/**
 * Validates a host path exists and is accessible.
 * Throws an Error if the path is invalid.
 */
export function validateHostPath(hostPath: string): void {
    if (!hostPath) throw new Error("Path is required");
    if (!path.isAbsolute(hostPath)) throw new Error(`Path must be absolute: '${hostPath}'`);
    if (!fs.existsSync(hostPath)) throw new Error(`Path does not exist: '${hostPath}'`);

    const stats = fs.statSync(hostPath);
    if (!stats.isDirectory()) throw new Error(`Path is not a directory: '${hostPath}'`);

    try {
        fs.accessSync(hostPath, fs.constants.R_OK);
    } catch {
        throw new Error(`Path is not accessible: '${hostPath}'`);
    }
}

/**
 * Validates a share name (folder name visible in Windows).
 * Throws an Error if the name is invalid.
 */
export function validateShareName(name: string): void {
    if (!name) throw new Error("Name is required");
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error(`Name '${name}' contains invalid characters, only letters, numbers, underscores, and hyphens are allowed`);
    if (name.length > 32) throw new Error(`Name '${name}' exceeds maximum length of 32 characters`);
}

function resolveComposeHostPath(hostPath: string): string {
    return hostPath.replace("${HOME}", os.homedir());
}

function getVolumePaths(volumeStr: string): [hostPath: string, containerPath: string] | null {
    const parts = volumeStr.split(":");
    if (parts.length < 2) {
        return null;
    }

    const lastPart = parts.at(-1)!;
    const containerPathIndex = lastPart.startsWith("/") ? parts.length - 1 : parts.length - 2;
    const containerPath = parts[containerPathIndex];
    if (!containerPath?.startsWith("/")) {
        return null;
    }

    return [parts.slice(0, containerPathIndex).join(":"), containerPath];
}

export function isRootSharedFolderMount(volumeStr: string): boolean {
    return getVolumePaths(volumeStr)?.[1] === SHARED_FOLDER_ROOT;
}

function getSharedFolderVolume(compose: ComposeConfig): string | undefined {
    return compose.services.windows.volumes.find(isRootSharedFolderMount);
}

export function getSharedFolderHostPath(compose: ComposeConfig): string | null {
    const sharedFolderVolume = getSharedFolderVolume(compose);
    const hostPath = sharedFolderVolume ? getVolumePaths(sharedFolderVolume)?.[0] : null;
    return hostPath ? resolveComposeHostPath(hostPath) : null;
}

/**
 * Converts a CustomVolumeMount to compose volume string format.
 * Custom mounts always live under Dockur's Data2 share root.
 */
function mountToVolumeString(mount: CustomVolumeMount): string {
    return `${mount.hostPath}:${CUSTOM_SHARE_ROOT}/${mount.shareName}`;
}

function isManagedCustomMountPath(containerPath: string): boolean {
    return (
        containerPath.startsWith(`${CUSTOM_SHARE_ROOT}/`) ||
        containerPath.startsWith(`${SHARED_FOLDER_ROOT}/`) ||
        containerPath.startsWith(`${STORAGE_SHARED_FOLDER_ROOT}/`) ||
        containerPath.startsWith(`${LEGACY_CUSTOM_DATA_ROOT}/`) ||
        containerPath.startsWith(`${LEGACY_CUSTOM_MOUNT_BASE}/`) ||
        containerPath.startsWith(`${LEGACY_SAMBA_MOUNT_BASE}/`) ||
        LEGACY_SINGLE_PATH_MOUNT.test(containerPath)
    );
}

/**
 * Identifies if a volume string is a custom user mount (not system).
 * Custom mounts live under Data2, with cleanup for older mount layouts.
 */
export function isCustomMount(volumeStr: string): boolean {
    const containerPath = getVolumePaths(volumeStr)?.[1];
    if (!containerPath) {
        return false;
    }

    const systemPaths = [
        "/storage",
        SHARED_FOLDER_ROOT,
        CUSTOM_SHARE_ROOT,
        STORAGE_SHARED_FOLDER_ROOT,
        LEGACY_CUSTOM_DATA_ROOT,
        "/oem",
        "/dev",
        "/dev/bus/usb",
    ];
    if (systemPaths.includes(containerPath)) {
        return false;
    }

    if (containerPath.startsWith("/dev/")) {
        return false;
    }

    return isManagedCustomMountPath(containerPath);
}

/**
 * Apply custom mounts to a compose config
 * Removes existing custom mounts and adds enabled ones
 */
export function applyCustomMounts(
    compose: ComposeConfig,
    mounts: CustomVolumeMount[]
): void {
    // Remove existing custom mounts (keep system volumes)
    compose.services.windows.volumes = compose.services.windows.volumes.filter(
        vol => !isCustomMount(vol)
    );

    // Add enabled custom mounts
    const enabledMounts = mounts
        .filter(m => m.enabled)
        .map(mountToVolumeString);

    compose.services.windows.volumes.push(...enabledMounts);
}
