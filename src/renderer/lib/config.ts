const fs: typeof import("fs") = require("node:fs");
const path: typeof import("path") = require("node:path");
import { DOSBOAT_DIR } from "./constants";
import { ContainerRuntimes } from "./containers/common";
import { logger } from "./winboat";
import type { PTSerializableDeviceInfo } from "./usbmanager";

export const MultiMonitorMode = {
    MULTIMON: "MultiMon",
    SPAN: "Span",
    SINGLE: "Single",
} as const;

export type RdpArg = {
    newArg: string;
    isReplacement: boolean;
    original?: string;
};

export class DosboatVersion {
    public readonly generation: number;
    public readonly major: number;
    public readonly minor: number;
    public readonly alpha: boolean;

    constructor(public readonly versionToken: string) {
        const versionTags = versionToken.split("-");
        const versionNumbers = versionTags[0].split(".").map(value => {
            const parsedValue = parseInt(value);

            if(Number.isNaN(parsedValue)) {
                throw new Error(`Invalid dosboat version format: '${versionToken}'`);
            }

            return parsedValue;
        });

        this.alpha = !!versionTags[1]?.includes("alpha");
        this.generation = versionNumbers[0];
        this.major = versionNumbers[1];
        this.minor = versionNumbers[2];
    }

    toString(): string {
        return this.versionToken;
    }

    toJSON(): string {
        return this.toString();
    }
}

type DosboatVersionData = {
    previous: DosboatVersion,
    current: DosboatVersion
}

export type DosboatConfigObj = {
    serialPorts: string[];
    passedThroughDevices: PTSerializableDeviceInfo[];
    experimentalFeatures: boolean;
    advancedFeatures: boolean;
    disableAnimations: boolean;
    scale: number;
    scaleDesktop: number;
    vncScale: number;
    multiMonitor: (typeof MultiMonitorMode)[keyof typeof MultiMonitorMode];
    smartcardEnabled: boolean;
    rdpMonitoringEnabled: boolean;
    rdpArgs: RdpArg[];
    appsSortOrder: "name" | "usage";
    containerRuntime: ContainerRuntimes;
    versionData: DosboatVersionData;
};

const currentVersion = new DosboatVersion(import.meta.env.VITE_APP_VERSION);

const defaultConfig: DosboatConfigObj = {
    serialPorts: [],
    passedThroughDevices: [],
    experimentalFeatures: false,
    advancedFeatures: false,
    disableAnimations: false,
    scale: 100,
    scaleDesktop: 100,
    vncScale: 2,
    multiMonitor: MultiMonitorMode.MULTIMON,
    smartcardEnabled: false,
    rdpMonitoringEnabled: false,
    rdpArgs: [],
    appsSortOrder: "name",
    containerRuntime: ContainerRuntimes.DOCKER,
    versionData: {
        previous: currentVersion,
        current: currentVersion
    },
};

export class DosboatConfig {
    private static readonly configPath: string = path.join(DOSBOAT_DIR, "dosboat.config.json");
    private static instance: DosboatConfig | null = null;
    
    // Due to us wrapping DosboatConfig in reactive, this can't be private
    configData: DosboatConfigObj = { ...defaultConfig };

    static getInstance() {
        DosboatConfig.instance ??= new DosboatConfig();
        return DosboatConfig.instance;
    }

    private constructor() {
        this.configData = DosboatConfig.readConfigObject()!;

        // Set correct versionData
        if(this.config.versionData.current.versionToken !== currentVersion.versionToken) {
            this.config.versionData.previous = this.config.versionData.current;
            this.config.versionData.current = currentVersion;

            logger.info(`Updated version data from '${this.config.versionData.previous.toString()}' to '${currentVersion.toString()}'`);
        }

        console.log("Reading current config", this.configData);
    }

    get config(): DosboatConfigObj {
        // Return a proxy to intercept property sets
        return new Proxy(this.configData, {
            get: (target, key) => Reflect.get(target, key),
            set: (target, key, value) => {
                const result = Reflect.set(target, key, value);

                DosboatConfig.writeConfigObject(target);
                console.info("Wrote modified config to disk");

                return result;
            },
        });
    }

    set config(newConfig: DosboatConfigObj) {
        this.configData = { ...newConfig };
        DosboatConfig.writeConfigObject(newConfig);
        console.info("Wrote modified config to disk");
    }

    static writeConfigObject(configObj: DosboatConfigObj): void {
        console.log("writing data: ", configObj);
        fs.writeFileSync(DosboatConfig.configPath, JSON.stringify(configObj, null, 4), "utf-8");
    }

    static readConfigObject(writeDefault = true): DosboatConfigObj | null {
        if (!fs.existsSync(DosboatConfig.configPath)) {
            if (!writeDefault) return null;
            // Also create the directory because we're not guaranteed to have it
            if (!fs.existsSync(DOSBOAT_DIR)) {
                fs.mkdirSync(DOSBOAT_DIR);
            }

            fs.writeFileSync(DosboatConfig.configPath, JSON.stringify(defaultConfig, null, 4), "utf-8");
            return { ...defaultConfig };
        }

        try {
            const rawConfig = fs.readFileSync(DosboatConfig.configPath, "utf-8");
            const configObjRaw = JSON.parse(rawConfig);

            // Parse dosboat version data
            if(configObjRaw.versionData) {
                configObjRaw.versionData.current = new DosboatVersion(configObjRaw.versionData.current);
                configObjRaw.versionData.previous = new DosboatVersion(configObjRaw.versionData.previous);
            }

            const configObj = configObjRaw as DosboatConfigObj;

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
                            JSON.stringify(defaultConfig[key as keyof DosboatConfigObj])
                        }`,
                    );
                }

                // If we have any missing keys, we should just write the config back to disk so those new keys are saved
                // We cannot use this.writeConfig() here since #configData is not populated yet
                if (hasMissing) {
                    fs.writeFileSync(DosboatConfig.configPath, JSON.stringify(configObj, null, 4), "utf-8");
                    console.log("Wrote updated config with missing keys to disk");
                }
            }

            return { ...configObj };
        } catch (e) {
            console.error("Config's borked, outputting the default:", e);
            return { ...defaultConfig };
        }
    }
}
