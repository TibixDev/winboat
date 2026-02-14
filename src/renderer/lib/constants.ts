const os: typeof import("os") = require("node:os");
const path: typeof import("path") = require("node:path");

// Should be {home}/.dosboat
export const DOSBOAT_DIR = path.join(os.homedir(), ".dosboat");
export const DEFAULT_HOMEBREW_DIR = path.join(os.homedir(), "../linuxbrew/.linuxbrew/bin");

export const FREEDOS_VERSIONS = {
    "1.3": "FreeDOS 1.3",
    "1.2": "FreeDOS 1.2",
    custom: "Custom ISO",
};

export type FreeDOSVersionKey = keyof typeof FREEDOS_VERSIONS;

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
