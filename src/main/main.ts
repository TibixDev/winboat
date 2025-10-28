import { app, BrowserWindow, ipcMain, session } from "electron";
import { join } from "path";
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
};

const windowStore = new Store<SchemaType>({
    schema: {
        dimensions: {
            type: "object",
            properties: {
                width: {
                    type: "number",
                    minimum: WINDOW_MIN_WIDTH,
                    default: WINDOW_MIN_WIDTH,
                },
                height: {
                    type: "number",
                    minimum: WINDOW_MIN_HEIGHT,
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
const LAUNCH_CHANNEL = "shortcut-launch-app";

const extractLaunchTarget = (argv: string[]): string | null => {
    const flagIndex = argv.findIndex(arg => arg === "--launch" || arg.startsWith("--launch="));

    if (flagIndex === -1) {
        return null;
    }

    const flag = argv[flagIndex];

    if (flag.startsWith("--launch=")) {
        const value = flag.slice("--launch=".length).trim();
        return value.length ? value : null;
    }

    const value = argv[flagIndex + 1];
    return value ? value.trim() : null;
};

let pendingLaunchApp: string | null = extractLaunchTarget(process.argv);

function createWindow() {
    if (!app.requestSingleInstanceLock()) {
        app.quit();
        return;
    }

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

    const flushPendingLaunch = () => {
        if (pendingLaunchApp) {
            mainWindow?.webContents.send(LAUNCH_CHANNEL, pendingLaunchApp);
            pendingLaunchApp = null;
        }
    };

    mainWindow.webContents.on("did-finish-load", flushPendingLaunch);

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

app.on("second-instance", (_event, argv) => {
    const launchTarget = extractLaunchTarget(argv);

    if (launchTarget) {
        if (mainWindow && !mainWindow.webContents.isLoading()) {
            mainWindow.webContents.send(LAUNCH_CHANNEL, launchTarget);
        } else {
            pendingLaunchApp = launchTarget;
        }
    }

    if (mainWindow) {
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        mainWindow.focus();
    }
});

ipcMain.on("message", (_event, message) => {
    console.log(message);
});
