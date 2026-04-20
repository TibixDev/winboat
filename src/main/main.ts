import { app, BrowserWindow, ipcMain, session, dialog, Tray, Menu, nativeImage } from "electron";
import fs from "fs";
import os from "os";
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
                    default: 0,
                },
                y: {
                    type: "number",
                    default: 0,
                },
            },
            required: ["x", "y"],
        },
    },
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const CONFIG_PATH = join(os.homedir(), ".winboat", "winboat.config.json");

function updateTrayMenu() {
    if (!tray) return;

    let recentApps: any[] = [];
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
            recentApps = config.recentApps || [];
        }
    } catch (e) {
        console.error("Failed to read config for tray", e);
    }

    const recentAppsMenu = recentApps.slice(0, 10).map((app: any) => ({
        label: app.name,
        click: () => {
            mainWindow?.webContents.send("launch-app-by-name", app.name);
            mainWindow?.show();
        },
    }));

    const contextMenu = Menu.buildFromTemplate([
        { label: "WinBoat", enabled: false },
        { type: "separator" },
        {
            label: "Open Apps",
            click: () => {
                mainWindow?.webContents.send("navigate", "/apps");
                mainWindow?.show();
            },
        },
        {
            label: "Open Configuration",
            click: () => {
                mainWindow?.webContents.send("navigate", "/config");
                mainWindow?.show();
            },
        },
        { type: "separator" },
        {
            label: "Recent Apps",
            submenu: recentAppsMenu.length > 0 ? recentAppsMenu : [{ label: "No recent apps", enabled: false }],
        },
        { type: "separator" },
        { label: "Run Container", click: () => mainWindow?.webContents.send("container-action", "start") },
        { label: "Pause Container", click: () => mainWindow?.webContents.send("container-action", "pause") },
        { type: "separator" },
        {
            label: "Quit",
            click: () => {
                isQuitting = true;
                app.quit();
            },
        },
    ]);

    tray.setContextMenu(contextMenu);
}

function createTray() {
    // Try to find the logo
    let iconPath = app.isPackaged
        ? join(process.resourcesPath, "icons", "winboat_logo.png")
        : join(app.getAppPath(), "icons", "winboat_logo.png");

    if (!fs.existsSync(iconPath)) {
        // Fallback to SVG if PNG doesn't exist, though Tray might not support SVG on all platforms
        iconPath = app.isPackaged
            ? join(process.resourcesPath, "icons", "winboat_logo.svg")
            : join(app.getAppPath(), "icons", "winboat_logo.svg");
    }

    const icon = nativeImage.createFromPath(iconPath);
    // TODO: Use the project SVG icon, downscale it to 32x32 and make it monochrome (Lazy to do this)
    tray = new Tray(icon.resize({ width: 16, height: 16 }));

    updateTrayMenu();

    tray.on("click", () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    tray.setToolTip("WinBoat");
}

function createWindow() {
    if (!app.requestSingleInstanceLock()) {
        // @ts-ignore property "window" is optional, see: [dialog.showMessageBoxSync](https://www.electronjs.org/docs/latest/api/dialog#dialogshowmessageboxsyncwindow-options)
        dialog.showMessageBoxSync(null, {
            type: "error",
            buttons: ["Close"],
            title: "WinBoat",
            message: "An instance of WinBoat is already running.\n\tMultiple Instances are not allowed.",
        });
        app.exit();
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

    mainWindow.on("close", (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow?.hide();
            return false;
        }

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

app.on("second-instance", _ => {
    if (mainWindow) {
        mainWindow.focus();
    }
});

ipcMain.on("message", (_event, message) => {
    console.log(message);
});

ipcMain.on("update-tray", () => {
    updateTrayMenu();
});

ipcMain.on("init-tray", () => {
    if (!tray) {
        createTray();
    }
});
