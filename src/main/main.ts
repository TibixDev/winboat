import { app, BrowserWindow, ipcMain, session, dialog } from "electron";
import { join } from "path";
import { initialize, enable } from "@electron/remote/main/index.js";
import Store from "electron-store";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

initialize();

// Window Constants
const WINDOW_MIN_WIDTH = 1280;
const WINDOW_MIN_HEIGHT = 800;

// For electron-store Type-Safety
type SchemaType = {
    dimensions: {
        width: number;
        height: number;
    };
    position: {
        x: number;
        y: number;
    };
};

const windowStore = new Store<SchemaType>({
    schema: {
        dimensions: {
            type: "object",
            properties: {
                width: {
                    type: "number",
                    default: WINDOW_MIN_WIDTH,
                },
                height: {
                    type: "number",
                    default: WINDOW_MIN_HEIGHT,
                },
            },
            required: ["width", "height"],
        },
        position: {
            type: "object",
            properties: {
                x: {
                    type: "number",
                },
                y: {
                    type: "number",
                },
            },
            required: ["x", "y"],
        },
    },
});

let mainWindow: BrowserWindow | null = null;
let pendingLaunchApp: string | null = null;

// Parse startup arguments immediately
const launchAppIndex = process.argv.findIndex((arg) => arg.startsWith("--launch-app-name="));
if (launchAppIndex !== -1) {
    const appNameArg = process.argv[launchAppIndex];
    const appName = appNameArg.split("=")[1]?.replace(/^"(.*)"$/, "$1");
    if (appName) {
        console.log(`Pending launch app (startup): ${appName}`);
        pendingLaunchApp = appName;
    }
}

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on("second-instance", (_event, commandLine) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();

            // Handle --launch-app-name argument from desktop shortcuts
            const launchAppIndex = commandLine.findIndex((arg) => arg.startsWith("--launch-app-name="));
            if (launchAppIndex !== -1) {
                const appNameArg = commandLine[launchAppIndex];
                const appName = appNameArg.split("=")[1]?.replace(/^"(.*)"$/, "$1"); // Remove quotes
                if (appName) {
                    console.log(`Launching app from shortcut (second-instance): ${appName}`);
                    mainWindow.webContents.send("launch-app-from-shortcut", appName);
                }
            }
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        minWidth: WINDOW_MIN_WIDTH,
        minHeight: WINDOW_MIN_HEIGHT,
        width: windowStore.get("dimensions.width"),
        height: windowStore.get("dimensions.height"),
        x: windowStore.get("position.x"),
        y: windowStore.get("position.y"),
        transparent: false,
        frame: false,
        webPreferences: {
            // preload: join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    mainWindow.on("close", () => {
        const bounds = mainWindow?.getBounds();

        windowStore.set("dimensions", {
            width: bounds?.width,
            height: bounds?.height,
        });

        windowStore.set("position", {
            x: bounds?.x,
            y: bounds?.y,
        });
    });

    enable(mainWindow.webContents);

    // Removed flaky did-finish-load listener

    if (process.env.NODE_ENV === "development") {
        const rendererPort = process.argv[2];
        mainWindow.loadURL(`http://localhost:${rendererPort}`);
    } else {
        mainWindow.loadFile(join(app.getAppPath(), "renderer", "index.html"));
    }
}

app.whenReady().then(() => {
    createWindow();

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                // 'Content-Security-Policy': ['script-src \'self\'']
                "Content-Security-Policy": [
                    "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' 'unsafe-inline'",
                    "worker-src 'self' blob:",
                    "media-src 'self' blob:",
                    "font-src 'self' 'unsafe-inline' https://fonts.gstatic.com;",
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                ],
            },
        });
    });

    app.on("activate", function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", function () {
    if (process.platform !== "darwin") app.quit();
});

// Desktop Shortcuts IPC Handlers
ipcMain.handle("get-pending-launch-app", async () => {
    const app = pendingLaunchApp;
    pendingLaunchApp = null; // Clear after fetching
    return app;
});

ipcMain.handle("create-desktop-shortcut", async (_event, app) => {
    try {
        const { DesktopShortcutsManager } = require("./server/shortcuts.js");
        const manager = DesktopShortcutsManager.getInstance();
        await manager.createShortcut(app);
        return { success: true };
    } catch (error: any) {
        console.error("Failed to create desktop shortcut:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("remove-desktop-shortcut", async (_event, app) => {
    try {
        const { DesktopShortcutsManager } = require("./server/shortcuts.js");
        const manager = DesktopShortcutsManager.getInstance();
        await manager.removeShortcut(app);
        return { success: true };
    } catch (error: any) {
        console.error("Failed to remove desktop shortcut:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("has-desktop-shortcut", async (_event, app) => {
    try {
        const { DesktopShortcutsManager } = require("./server/shortcuts.js");
        const manager = DesktopShortcutsManager.getInstance();
        return manager.hasShortcut(app);
    } catch (error: any) {
        console.error("Failed to check desktop shortcut:", error);
        return false;
    }
});

ipcMain.on("message", (_event, message) => {
    console.log(message);
});
