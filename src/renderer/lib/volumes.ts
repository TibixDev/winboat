const fs: typeof import("fs") = require("node:fs");
const path: typeof import("path") = require("node:path");

import type { CustomVolumeMount, ComposeConfig } from "../../types";

/**
 * Validates a host path exists and is accessible
 */
export function validateHostPath(hostPath: string): { valid: boolean; error?: string } {
    try {
        if (!hostPath) {
            return { valid: false, error: "Path is required" };
        }
        if (!path.isAbsolute(hostPath)) {
            return { valid: false, error: "Path must be absolute" };
        }
        if (!fs.existsSync(hostPath)) {
            return { valid: false, error: "Path does not exist" };
        }
        const stats = fs.statSync(hostPath);
        if (!stats.isDirectory()) {
            return { valid: false, error: "Path is not a directory" };
        }
        fs.accessSync(hostPath, fs.constants.R_OK);
        return { valid: true };
    } catch {
        return { valid: false, error: "Path is not accessible" };
    }
}

/**
 * Validates a share name (folder name visible in Windows)
 */
export function validateShareName(name: string): { valid: boolean; error?: string } {
    if (!name) {
        return { valid: false, error: "Name is required" };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        return { valid: false, error: "Only letters, numbers, underscores, hyphens" };
    }
    if (name.length > 32) {
        return { valid: false, error: "Max 32 characters" };
    }
    return { valid: true };
}

// Base path for custom mounts (avoids /tmp/smb which gets cleaned on container start)
export const CUSTOM_MOUNT_BASE = "/mnt/winboat";

/**
 * Converts a CustomVolumeMount to compose volume string format
 * Mounts under /mnt/winboat/ - symlinks are created in /tmp/smb/ after container starts
 */
export function mountToVolumeString(mount: CustomVolumeMount): string {
    return `${mount.hostPath}:${CUSTOM_MOUNT_BASE}/${mount.shareName}`;
}

/**
 * Identifies if a volume string is a custom user mount (not system)
 * Custom mounts are under /mnt/winboat/ (or legacy paths /tmp/smb/, or bare paths like /gamez)
 */
export function isCustomMount(volumeStr: string): boolean {
    const parts = volumeStr.split(":");
    const containerPath = parts.length >= 2 ? parts[parts.length - 1] : "";

    // System paths that should NOT be considered custom mounts
    const systemPaths = ["/storage", "/shared", "/oem", "/dev/bus/usb", "/dev"];

    // If it's a system path, it's not custom
    if (systemPaths.some(p => containerPath === p || containerPath.startsWith(p + "/"))) {
        return false;
    }

    // Current format: /mnt/winboat/<name>
    if (containerPath.startsWith(CUSTOM_MOUNT_BASE + "/")) {
        return true;
    }

    // Legacy format: /tmp/smb/<name>
    if (containerPath.startsWith("/tmp/smb/")) {
        return true;
    }

    // Very old format: bare path like /gamez (not a system path, likely custom)
    // Only match single-level paths that aren't system
    if (containerPath.match(/^\/[a-zA-Z0-9_-]+$/)) {
        return true;
    }

    return false;
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

/**
 * Creates symlinks in /tmp/smb/ pointing to /mnt/winboat/ mounts
 * This makes custom mounts accessible via \\host.lan\Data\<shareName>
 * Returns shell commands to execute inside the container
 */
export function getSymlinkCommands(mounts: CustomVolumeMount[]): string[] {
    const enabledMounts = mounts.filter(m => m.enabled);
    if (enabledMounts.length === 0) return [];

    return enabledMounts.map(mount =>
        `ln -sfn ${CUSTOM_MOUNT_BASE}/${mount.shareName} /tmp/smb/${mount.shareName}`
    );
}
