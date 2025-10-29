import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import { MotionPlugin } from "@vueuse/motion";
import "./index.css";
import { autoScroll } from "./directives/autoscroll";
import VueApexCharts from "vue3-apexcharts";
import { Winboat, ContainerStatus } from "./lib/winboat";
import { useShortcutLaunchState } from "./composables/useShortcutLaunchState";
import { GUEST_API_PORT } from "./lib/constants";

const { ipcRenderer }: typeof import("electron") = require("electron");

createApp(App)
    .directive("auto-scroll", autoScroll)
    .use(router)
    .use(MotionPlugin)
    .use(VueApexCharts as any) // TODO: See https://github.com/apexcharts/vue3-apexcharts/issues/141
    .mount("#app");

// Handle app launch from desktop shortcuts
ipcRenderer.on("launch-app-from-shortcut", async (_event, appName: string) => {
    console.log(`Received request to launch app: ${appName}`);

    const winboat = Winboat.getInstance();
    const launchState = useShortcutLaunchState();

    // Start loading UI
    launchState.startLaunch(appName);

    // Wait for container to be ready if it's not running
    if (winboat.containerStatus.value !== ContainerStatus.Running) {
        console.log("Container not running, starting it...");
        launchState.updateStep("starting-container");
        try {
            await winboat.startContainer();

            // Wait for container to be fully ready
            launchState.updateStep("waiting-online");
            let attempts = 0;
            const maxAttempts = 60; // 60 seconds max
            while (!winboat.isOnline.value && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                attempts++;
            }

            if (!winboat.isOnline.value) {
                console.error("Container failed to come online in time");
                launchState.cancelLaunch();
                return;
            }
        } catch (error) {
            console.error("Failed to start container:", error);
            launchState.cancelLaunch();
            return;
        }
    }

    // Wait for apps to be loaded and port manager to be ready
    if (!winboat.appMgr || !winboat.isOnline.value || !winboat.portMgr.value) {
        console.log("Waiting for Winboat to be online...");
        launchState.updateStep("waiting-online");
        let attempts = 0;
        const maxAttempts = 30;
        while ((!winboat.isOnline.value || !winboat.portMgr.value) && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }

        if (!winboat.isOnline.value || !winboat.portMgr.value) {
            console.error("Container failed to come online in time or port manager not ready");
            launchState.cancelLaunch();
            return;
        }
    }

    // Find and launch the app
    try {
        launchState.updateStep("launching-app");

        // Get apps from API using the port manager
        const apiPort = winboat.getHostPort(GUEST_API_PORT);
        const apiUrl = `http://127.0.0.1:${apiPort}`;
        console.log(`Using API URL: ${apiUrl}`);
        const apps = await winboat.appMgr!.getApps(apiUrl);

        const app = apps.find(a => a.Name === appName);
        if (app) {
            console.log(`Launching app: ${appName}`);

            // Launch the app (don't await - it blocks until RDP session closes)
            winboat.launchApp(app).catch(error => {
                console.error(`Error during app launch: ${error}`);
                launchState.cancelLaunch();
            });

            // Wait a bit for the RDP window to appear before dismissing the overlay
            // This gives time for the window to become visible without blocking on the entire session
            setTimeout(() => {
                launchState.completeLaunch();
            }, 3000); // 3 seconds should be enough for the RDP window to appear
        } else {
            console.error(`App not found: ${appName}`);
            launchState.cancelLaunch();
        }
    } catch (error) {
        console.error(`Failed to launch app ${appName}:`, error);
        launchState.cancelLaunch();
    }
});
