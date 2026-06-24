import { app, BrowserWindow, ipcMain, session, dialog } from "electron";
import { join } from "path";
import { initialize, enable } from "@electron/remote/main/index.js";
import Store from "electron-store";
import { readFileSync } from "fs";

/**
 * Detect whether the host has loaded the WinBoat AppArmor profile.
 *
 * Background — closes #250 and partially #796:
 * On Ubuntu 23.10+ / 24.04+ (and derivatives such as Zorin OS 18), the kernel
 * sysctl \`kernel.apparmor_restrict_unprivileged_userns = 1\` blocks Chromium's
 * user-namespace sandbox unless the binary is covered by an AppArmor profile
 * that grants \`userns\`. When no profile is loaded, Electron's GPU process
 * crashes with \`exit_code=139\` / \`seccomp-bpf failure in syscall nr=0x3e\`.
 *
 * Reference: https://github.com/electron/electron/issues/41066
 *
 * The proper fix is to ship an AppArmor profile (see packaging/apparmor/winboat).
 * The .deb / .rpm packages install that profile via postinst. AppImage builds
 * cannot install system AppArmor profiles, so we fall back to disabling the
 * GPU process sandbox at runtime — a small security regression that is
 * the only way to keep the AppImage usable on locked-down hosts.
 *
 * This function does the runtime probe so a single binary works in both
 * cases: secure-by-default when the profile is installed, functional
 * fallback when it is not.
 */
function isWinboatAppArmorProfileLoaded(): boolean {
    if (process.platform !== "linux") return true; // sandbox restriction is Linux-only
    try {
        const profiles = readFileSync("/sys/kernel/security/apparmor/profiles", "utf-8");
        // Profile lines look like:  winboat (enforce)  /  winboat (complain)
        // Match any line whose first token is the literal profile name.
        return profiles.split("\n").some(line => line.trim().startsWith("winboat "));
    } catch {
        // /sys/kernel/security/apparmor/profiles is absent when AppArmor itself
        // is not loaded (most non-Ubuntu distros). On those hosts the userns
        // restriction does not apply, so the sandbox works as designed.
        return true;
    }
}

// Apply GPU-process workarounds *before* app.whenReady(). Electron requires
// command-line switches to be set at this point or they are ignored.
if (!isWinboatAppArmorProfileLoaded()) {
    // Symptom mitigation, not a fix — see the docblock above. The renderer
    // sandbox is still active; only the GPU process sandbox is relaxed.
    app.commandLine.appendSwitch("disable-gpu-sandbox");
    console.warn(
        "[winboat] AppArmor profile 'winboat' not loaded; falling back to " +
            "--disable-gpu-sandbox. Install the .deb/.rpm package or load the " +
            "profile from packaging/apparmor/winboat for the secure default.",
    );
}

// Use Wayland when available, X11 otherwise. This is the Electron 38+ default
// but we set it explicitly so behaviour is consistent across the supported
// Electron 40 range. Issue #566 (Wayland multi-monitor freezes) is upstream
// and is mitigated separately by the FreeRDP GFX pipeline changes — see
// src/renderer/lib/winboat.ts.
app.commandLine.appendSwitch("ozone-platform-hint", "auto");

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
