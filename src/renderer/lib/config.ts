const fs: typeof import("fs") = require("fs");
const path: typeof import("path") = require("path");
import { WINBOAT_DIR } from "./constants";

export type WinboatConfigObj = {
    scale: number;
    smartcardEnabled: boolean
};

const defaultConfig: WinboatConfigObj = {
    scale: 100,
    smartcardEnabled: false
};

let instance: WinboatConfig | null = null;

export class WinboatConfig {
    #configPath: string = path.join(WINBOAT_DIR, "winboat.config.json");
    #configData: WinboatConfigObj = { ...defaultConfig };

    constructor() {
        if (instance) return instance;
        this.#configData = this.readConfig();
        console.log("Reading current config", this.#configData);
        instance = this;
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
        fs.writeFileSync(this.#configPath, JSON.stringify(this.#configData, null, 4), "utf-8");
    }

    readConfig(): WinboatConfigObj {
        if (!fs.existsSync(this.#configPath)) {
            fs.writeFileSync(this.#configPath, JSON.stringify(defaultConfig, null, 4), "utf-8");
            return { ...defaultConfig };
        }

        try {
            const rawConfig = fs.readFileSync(this.#configPath, "utf-8");
            console.log("Successfully read the config file");
            return { ...JSON.parse(rawConfig) as WinboatConfigObj };
        } catch (e) {
            console.error("Config’s borked, outputting the default:", e);
            return { ...defaultConfig };
        }
    }
}