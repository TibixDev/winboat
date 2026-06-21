const os: typeof import("os") = require("node:os");
const path: typeof import("path") = require("node:path");

// Should be {home}/.winboat
export const WINBOAT_DIR = path.join(os.homedir(), ".winboat");
export const DEFAULT_HOMEBREW_DIR = path.join(os.homedir(), "../linuxbrew/.linuxbrew/bin");

export const WINDOWS_VERSIONS = {
    "11": "Windows 11 Pro",
    "11l": "Windows 11 LTSC 2024",
    "11e": "Windows 11 Enterprise",
    "10": "Windows 10 Pro",
    "10l": "Windows 10 LTSC 2021",
    "10e": "Windows 10 Enterprise",
    remote: "Windows Remote",
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
