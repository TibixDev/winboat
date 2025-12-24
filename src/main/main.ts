import { app, BrowserWindow, ipcMain, session, dialog } from "electron";
import { join } from "path";
import { readFileSync } from "fs";
import { realpath } from "fs/promises";
import { initialize, enable } from "@electron/remote/main/index.js";
import Store from "electron-store";

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
    winboatExecutablePath?: string;
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

// Request single instance lock before doing anything else
// This must happen BEFORE app.whenReady() so second instances can pass args and exit silently
if (!app.requestSingleInstanceLock()) {
    // Another instance is already running
    // Check if we're launching an app - if so, exit silently (the first instance will handle it)
    // Otherwise, show a dialog to inform the user
    const hasLaunchFlag = process.argv.some(
        arg => arg.startsWith("--launch-app-name=") || arg.startsWith("--launch-app-path="),
    );

    if (!hasLaunchFlag) {
        // Not launching an app, show dialog before exiting
        dialog.showErrorBox("WinBoat Already Running", "WinBoat is already running. Please use the existing window.");
    }
    // Exit silently if launching an app, or after showing dialog
    app.quit();
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

    if (process.env.NODE_ENV === "development") {
        const rendererPort = process.argv[2];
        mainWindow.loadURL(`http://localhost:${rendererPort}`);
    } else {
        mainWindow.loadFile(join(app.getAppPath(), "renderer", "index.html"));
    }
}

app.whenReady().then(async () => {
    // Store the WinBoat executable path if not already stored
    // This ensures desktop shortcuts can invoke WinBoat even if it's not in PATH
    await storeExecutablePath();

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

app.on("second-instance", (_, commandLine) => {
    if (mainWindow) {
        mainWindow.focus();

        // Check if we're launching an app from a desktop shortcut
        // Support both --launch-app-name and --launch-app-path for flexibility
        const launchAppNameArg = commandLine.find(arg => arg.startsWith("--launch-app-name="));
        const launchAppPathArg = commandLine.find(arg => arg.startsWith("--launch-app-path="));

        if (launchAppNameArg) {
            const appName = launchAppNameArg.substring("--launch-app-name=".length);
            console.log(`Second instance received launch request for app name: ${appName}`);
            mainWindow.webContents.send("launch-app-from-shortcut", appName);
        } else if (launchAppPathArg) {
            const appPath = launchAppPathArg.substring("--launch-app-path=".length);
            console.log(`Second instance received launch request for app path: ${appPath}`);
            mainWindow.webContents.send("launch-app-from-shortcut-by-path", appPath);
        }
    }
});

ipcMain.on("message", (_event, message) => {
    console.log(message);
});

// Handle app launch from command line on first instance
app.whenReady().then(() => {
    // Support both --launch-app-name and --launch-app-path
    const launchAppNameArg = process.argv.find(arg => arg.startsWith("--launch-app-name="));
    const launchAppPathArg = process.argv.find(arg => arg.startsWith("--launch-app-path="));

    if (launchAppNameArg) {
        const appName = launchAppNameArg.substring("--launch-app-name=".length);
        console.log(`First instance received launch request for app name: ${appName}`);
        // Wait a bit for the window to be ready, then send the launch command
        setTimeout(() => {
            mainWindow?.webContents.send("launch-app-from-shortcut", appName);
        }, 2000);
    } else if (launchAppPathArg) {
        const appPath = launchAppPathArg.substring("--launch-app-path=".length);
        console.log(`First instance received launch request for app path: ${appPath}`);
        setTimeout(() => {
            mainWindow?.webContents.send("launch-app-from-shortcut-by-path", appPath);
        }, 2000);
    }
});

/**
 * Stores the realpath of the WinBoat executable for future invocations
 * Uses argv[0] or ARGV0 environment variable if available
 * This ensures desktop shortcuts work even when WinBoat is not in PATH
 */
async function storeExecutablePath(): Promise<void> {
    try {
        // Check if we already have a stored path
        const storedPath = windowStore.get("winboatExecutablePath");
        if (storedPath) {
            console.log(`WinBoat executable path already stored: ${storedPath}`);
            return;
        }

        // Get the executable path - prefer ARGV0 env var, fall back to argv[0]
        const execPath = process.env.ARGV0 || process.argv[0];

        // Resolve to realpath (follows symlinks)
        const realPath = await realpath(execPath);

        // Store it for future use
        windowStore.set("winboatExecutablePath", realPath);
        console.log(`Stored WinBoat executable path: ${realPath}`);
    } catch (error) {
        console.error("Failed to store executable path:", error);
        // Non-critical error, continue anyway
    }
}
