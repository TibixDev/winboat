const fs: typeof import("fs") = require("node:fs");
const path: typeof import("path") = require("node:path");
import { type WinApp } from "../../types";
import { WINBOAT_DIR } from "./constants";
import { type PTSerializableDeviceInfo } from "./usbmanager";

export type RdpArg = {
    original?: string;
    newArg: string;
    isReplacement: boolean;
};

export type WinboatConfigObj = {
    scale: number;
    scaleDesktop: number;
    smartcardEnabled: boolean;
    rdpMonitoringEnabled: boolean;
    passedThroughDevices: PTSerializableDeviceInfo[];
    customApps: WinApp[];
    experimentalFeatures: boolean;
    advancedFeatures: boolean;
    multiMonitor: number;
    rdpArgs: RdpArg[];
    disableAnimations: boolean;
    desktopShortcuts: string[]; // Array of app names that have desktop shortcuts
    winboatExecutablePath?: string; // Custom path to WinBoat executable (for desktop shortcuts)
};

const defaultConfig: WinboatConfigObj = {
    scale: 100,
    scaleDesktop: 100,
    smartcardEnabled: false,
    rdpMonitoringEnabled: false,
    passedThroughDevices: [],
    customApps: [],
    experimentalFeatures: false,
    advancedFeatures: false,
    multiMonitor: 0,
    rdpArgs: [],
    disableAnimations: false,
    desktopShortcuts: [],
    winboatExecutablePath: undefined,
};

export class WinboatConfig {
    private static instance: WinboatConfig | null = null;
    readonly #configPath: string = path.join(WINBOAT_DIR, "winboat.config.json");
    #configData: WinboatConfigObj = { ...defaultConfig };

    static getInstance() {
        WinboatConfig.instance ??= new WinboatConfig();
        return WinboatConfig.instance;
    }

    private constructor() {
        this.#configData = this.readConfig();
        console.log("Reading current config", this.#configData);
    }

    get config(): WinboatConfigObj {
        // Return a proxy to intercept property sets
        return new Proxy(this.#configData, {
            get: (target, key) => target[key as keyof WinboatConfigObj],
            set: (target, key, value) => {
                // @ts-expect-error This is valid
                target[key as keyof WinboatConfigObj] = value;
                this.writeConfig();
                console.info("Wrote modified config to disk");
                return true;
            },
        });
    }

    set config(newConfig: WinboatConfigObj) {
        this.#configData = { ...newConfig };
        this.writeConfig();
        console.info("Wrote modified config to disk");
    }

    writeConfig(): void {
        console.log("writing data: ", this.#configData);
        fs.writeFileSync(this.#configPath, JSON.stringify(this.#configData, null, 4), "utf-8");
    }

    readConfig(): WinboatConfigObj {
        if (!fs.existsSync(this.#configPath)) {
            // Also the create the directory because we're not guaranteed to have it
            if (!fs.existsSync(WINBOAT_DIR)) {
                fs.mkdirSync(WINBOAT_DIR);
            }

            fs.writeFileSync(this.#configPath, JSON.stringify(defaultConfig, null, 4), "utf-8");
            return { ...defaultConfig };
        }

        try {
            const rawConfig = fs.readFileSync(this.#configPath, "utf-8");
            const configObj = JSON.parse(rawConfig) as WinboatConfigObj;
            console.log("Successfully read the config file");

            // Some fields might be missing after an update, so we merge them with the default config
            for (const key in defaultConfig) {
                let hasMissing = false;
                if (!(key in configObj)) {
                    // @ts-expect-error This is valid
                    configObj[key] = defaultConfig[key];
                    hasMissing = true;
                    console.log(
                        `Added missing config key: ${key} with default value: ${
                            defaultConfig[key as keyof WinboatConfigObj]
                        }`,
                    );
                }

                // If we have any missing keys, we should just write the config back to disk so those new keys are saved
                // We cannot use this.writeConfig() here since #configData is not populated yet
                if (hasMissing) {
                    fs.writeFileSync(this.#configPath, JSON.stringify(configObj, null, 4), "utf-8");
                    console.log("Wrote updated config with missing keys to disk");
                }
            }

            return { ...configObj };
        } catch (e) {
            console.error("Config’s borked, outputting the default:", e);
            return { ...defaultConfig };
        }
    }
}
