const os: typeof import("os") = require("node:os");
const path: typeof import("path") = require("node:path");

// Should be {home}/.dosboat
export const DOSBOAT_DIR = path.join(os.homedir(), ".dosboat");
export const DEFAULT_HOMEBREW_DIR = path.join(os.homedir(), "../linuxbrew/.linuxbrew/bin");

export const FREEDOS_VERSIONS = {
    "1.4": "FreeDOS 1.4",
    custom: "Custom ISO",
};

export type FreeDOSVersionKey = keyof typeof FREEDOS_VERSIONS;

// Map version keys to base image filenames
export const FREEDOS_BASE_IMAGE_FILES: Record<Exclude<FreeDOSVersionKey, "custom">, string> = {
    "1.4": "FD14-base.qcow2",
};

// DOS-era memory options (label -> MB)
export const DOS_MEMORY_OPTIONS = {
    "128K": 128,
    "256K": 256,
    "512K": 512,
    "640K": 640,
    "704K": 704,
    "736K": 736,
    "992K": 992,
    "1M": 1024,
    "2M": 2048,
    "4M": 4096,
    "8M": 8192,
    "16M": 16384,
    "32M": 32768,
} as const;

export type DOSMemoryKey = keyof typeof DOS_MEMORY_OPTIONS;

export const SHARED_DRIVE_LETTERS = ["D"] as const;
export type SharedDriveLetter = (typeof SHARED_DRIVE_LETTERS)[number];
export const SHARED_DRIVE_INDEX_BY_LETTER: Record<SharedDriveLetter, number> = {
    D: 1,
};

// Ports
export const GUEST_QMP_PORT = 7149;
export const DEFAULT_HOST_QMP_PORT = 8149;
export const GUEST_RDP_PORT = 3389;

// Serial Port Prefixes
export const SERIAL_PORT_PREFIXES = ["ttyS", "ttyUSB", "ttyACM"];

// USB
export const USB_CLASS_IMAGING = 6;
export const USB_INTERFACE_MTP = 5;
export const USB_VID_BLACKLIST = [
    // Linux Foundation VID
    "1d6b:",
];

// Docker Restart Policies
export const RESTART_UNLESS_STOPPED = "unless-stopped";
export const RESTART_ON_FAILURE = "on-failure";
export const RESTART_ALWAYS = "always";
export const RESTART_NO = "no";
