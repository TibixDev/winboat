
const os: typeof import('os') = require('os');
const path: typeof import('path') = require('path');

// Should be {home}/.winboat
export const WINBOAT_DIR = path.join(os.homedir(), '.winboat');

export const WINBOAT_GUEST_API = "http://127.0.0.1:7148"

export const WINDOWS_VERSIONS = {
    "11": "Windows 11 Pro",
    "11l": "Windows 11 LTSC 2024",
    "11e": "Windows 11 Enterprise",
    "10": "Windows 10 Pro",
    "10l": "WIndows 10 LTSC 2021",
    "10e": "Windows 10 Enterprise",
    'custom': 'Custom Windows',
}

export type WindowsVersionKey = keyof typeof WINDOWS_VERSIONS;

export const WINDOWS_LANGUAGES = {
    "🇦🇪 Arabic": "Arabic" ,
    "🇧🇬 Bulgarian": "Bulgarian" ,
    "🇨🇳 Chinese": "Chinese" ,
    "🇭🇷 Croatian": "Croatian" ,
    "🇨🇿 Czech": "Czech" ,
    "🇩🇰 Danish": "Danish" ,
    "🇳🇱 Dutch": "Dutch" ,
    "🇬🇧 English": "English" ,
    "🇪🇪 Estonian": "Estonian" ,
    "🇫🇮 Finnish": "Finnish" ,
    "🇫🇷 French": "French" ,
    "🇩🇪 German": "German" ,
    "🇬🇷 Greek": "Greek" ,
    "🇮🇱 Hebrew": "Hebrew" ,
    "🇭🇺 Hungarian": "Hungarian" ,
    "🇮🇹 Italian": "Italian" ,
    "🇯🇵 Japanese": "Japanese" ,
    "🇰🇷 Korean": "Korean" ,
    "🇱🇻 Latvian": "Latvian" ,
    "🇱🇹 Lithuanian": "Lithuanian" ,
    "🇳🇴 Norwegian": "Norwegian" ,
    "🇵🇱 Polish": "Polish" ,
    "🇵🇹 Portuguese": "Portuguese" ,
    "🇷🇴 Romanian": "Romanian" ,
    "🇷🇺 Russian": "Russian" ,
    "🇷🇸 Serbian": "Serbian" ,
    "🇸🇰 Slovak": "Slovak" ,
    "🇸🇮 Slovenian": "Slovenian" ,
    "🇪🇸 Spanish": "Spanish" ,
    "🇸🇪 Swedish": "Swedish" ,
    "🇹🇭 Thai": "Thai" ,
    "🇹🇷 Turkish": "Turkish" ,
    "🇺🇦 Ukrainian": "Ukrainian"
}