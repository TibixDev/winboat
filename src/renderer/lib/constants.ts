const os: typeof import("os") = require("node:os");
const path: typeof import("path") = require("node:path");
const process: typeof import("process") = require("node:process");

const XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME ?? path.join(process.env.HOME!, ".config");
const XDG_DATA_HOME = process.env.XDG_DATA_HOME ?? path.join(process.env.HOME!, ".local/share");
const XDG_STATE_HOME = process.env.XDG_STATE_HOME ?? path.join(process.env.HOME!, ".local/state");
const XDG_CACHE_HOME = process.env.XDG_CACHE_HOME ?? path.join(process.env.HOME!, ".cache");

export const WINBOAT_CONFIG_DIR = path.join(XDG_CONFIG_HOME, "winboat");
export const WINBOAT_DATA_DIR = path.join(XDG_DATA_HOME, "winboat");
export const WINBOAT_STATE_DIR = path.join(XDG_STATE_HOME, "winboat");
export const WINBOAT_CACHE_HOME = path.join(XDG_CACHE_HOME, "winboat");

export const DEFAULT_HOMEBREW_DIR = path.join(os.homedir(), "../linuxbrew/.linuxbrew/bin");

export const WINDOWS_VERSIONS = {
    "11": "Windows 11 Pro",
    "11l": "Windows 11 LTSC 2024",
    "11e": "Windows 11 Enterprise",
    "10": "Windows 10 Pro",
    "10l": "Windows 10 LTSC 2021",
    "10e": "Windows 10 Enterprise",
    custom: "Custom Windows",
};

export type WindowsVersionKey = keyof typeof WINDOWS_VERSIONS;

export const WINDOWS_LANGUAGES = {
    "🇦🇪 Arabic": "Arabic",
    "🇧🇬 Bulgarian": "Bulgarian",
    "🇨🇳 Chinese": "Chinese",
    "🇭🇷 Croatian": "Croatian",
    "🇨🇿 Czech": "Czech",
    "🇩🇰 Danish": "Danish",
    "🇳🇱 Dutch": "Dutch",
    "🇬🇧 English": "English",
    "🇪🇪 Estonian": "Estonian",
    "🇫🇮 Finnish": "Finnish",
    "🇫🇷 French": "French",
    "🇩🇪 German": "German",
    "🇬🇷 Greek": "Greek",
    "🇮🇱 Hebrew": "Hebrew",
    "🇭🇺 Hungarian": "Hungarian",
    "🇮🇹 Italian": "Italian",
    "🇯🇵 Japanese": "Japanese",
    "🇰🇷 Korean": "Korean",
    "🇱🇻 Latvian": "Latvian",
    "🇱🇹 Lithuanian": "Lithuanian",
    "🇳🇴 Norwegian": "Norwegian",
    "🇵🇱 Polish": "Polish",
    "🇵🇹 Portuguese": "Portuguese",
    "🇷🇴 Romanian": "Romanian",
    "🇷🇺 Russian": "Russian",
    "🇷🇸 Serbian": "Serbian",
    "🇸🇰 Slovak": "Slovak",
    "🇸🇮 Slovenian": "Slovenian",
    "🇪🇸 Spanish": "Spanish",
    "🇸🇪 Swedish": "Swedish",
    "🇹🇭 Thai": "Thai",
    "🇹🇷 Turkish": "Turkish",
    "🇺🇦 Ukrainian": "Ukrainian",
};

// Ports
export const GUEST_RDP_PORT = 3389;
export const GUEST_QMP_PORT = 7149;
export const DEFAULT_HOST_QMP_PORT = 8149;

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
