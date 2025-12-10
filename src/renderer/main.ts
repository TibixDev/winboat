import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import { MotionPlugin } from "@vueuse/motion";
import "./index.css";
import { autoScroll } from "./directives/autoscroll";
import { DEFAULT_HOMEBREW_DIR } from "./lib/constants";
import VueApexCharts from "vue3-apexcharts";
import type { WinApp } from "../types";

const process: typeof import("process") = require("node:process");
const { ipcRenderer }: typeof import("electron") = require("electron");

/**
 * @note A big chunk of our userbase uses WinBoat under an immutable distro through GearLever.
 * In case it's the flatpak version of GearLever, PATH, and some other environment variables are stripped by default.
 * We include the default homebrew bin directiory for exactly this reason.
 * It's not WinBoat's responsibility if the PATH envvar is incomplete, but in this case it affects a lot of users.
 */
process.env.PATH && (process.env.PATH += `:${DEFAULT_HOMEBREW_DIR}`);

// Setup window.api for IPC communication
declare global {
    interface Window {
        api: {
            createDesktopShortcut: (app: WinApp) => Promise<{ success: boolean; error?: string }>;
            removeDesktopShortcut: (app: WinApp) => Promise<{ success: boolean; error?: string }>;
            hasDesktopShortcut: (app: WinApp) => Promise<boolean>;
            onLaunchAppFromShortcut: (callback: (appName: string) => void) => void;
        };
    }
}

window.api = {
    createDesktopShortcut: (app: WinApp) => ipcRenderer.invoke("create-desktop-shortcut", app),
    removeDesktopShortcut: (app: WinApp) => ipcRenderer.invoke("remove-desktop-shortcut", app),
    hasDesktopShortcut: (app: WinApp) => ipcRenderer.invoke("has-desktop-shortcut", app),
    onLaunchAppFromShortcut: (callback: (appName: string) => void) => {
        ipcRenderer.on("launch-app-from-shortcut", (_event, appName) => callback(appName));
    },
};


createApp(App)
    .directive("auto-scroll", autoScroll)
    .use(router)
    .use(MotionPlugin)
    .use(VueApexCharts as any) // TODO: See https://github.com/apexcharts/vue3-apexcharts/issues/141
    .mount("#app");
