const fs: typeof import("fs") = require("node:fs");
const path: typeof import("path") = require("node:path");
import { type WinApp } from "../../types";
import { WINBOAT_DIR } from "./constants";
import { type PTSerializableDeviceInfo } from "./usbmanager";
import { ContainerRuntimes } from "./containers/common";

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
    containerRuntime: ContainerRuntimes;
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
    containerRuntime: ContainerRuntimes.DOCKER, // TODO: Ideally should be podman once we flesh out everything
};

export class WinboatConfig {
    private static readonly configPath: string = path.join(WINBOAT_DIR, "winboat.config.json");
    private static instance: WinboatConfig | null = null;
    #configData: WinboatConfigObj = { ...defaultConfig };

    static getInstance() {
        WinboatConfig.instance ??= new WinboatConfig();
        return WinboatConfig.instance;
    }

    private constructor() {
        this.#configData = WinboatConfig.readConfigObject()!;
        console.log("Reading current config", this.#configData);
    }

    get config(): WinboatConfigObj {
        // Return a proxy to intercept property sets
        return new Proxy(this.#configData, {
            get: (target, key) => target[key as keyof WinboatConfigObj],
            set: (target, key, value) => {
                // @ts-expect-error This is valid
                target[key as keyof WinboatConfigObj] = value;
                WinboatConfig.writeConfigObject(target);
                console.info("Wrote modified config to disk");
                return true;
            },
        });
    }

    set config(newConfig: WinboatConfigObj) {
        this.#configData = { ...newConfig };
        WinboatConfig.writeConfigObject(newConfig);
        console.info("Wrote modified config to disk");
    }

    static writeConfigObject(configObj: WinboatConfigObj): void {
        console.log("writing data: ", configObj);
        fs.writeFileSync(WinboatConfig.configPath, JSON.stringify(configObj, null, 4), "utf-8");
    }

    static readConfigObject(writeDefault = true): WinboatConfigObj | null {
        if (!fs.existsSync(WinboatConfig.configPath)) {
            if (!writeDefault) return null;
            // Also the create the directory because we're not guaranteed to have it
            if (!fs.existsSync(WINBOAT_DIR)) {
                fs.mkdirSync(WINBOAT_DIR);
            }

            fs.writeFileSync(WinboatConfig.configPath, JSON.stringify(defaultConfig, null, 4), "utf-8");
            return { ...defaultConfig };
        }

        try {
            const rawConfig = fs.readFileSync(WinboatConfig.configPath, "utf-8");
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
                    fs.writeFileSync(WinboatConfig.configPath, JSON.stringify(configObj, null, 4), "utf-8");
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
