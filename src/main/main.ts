import { app, BrowserWindow, ipcMain, session, dialog } from 'electron';
import { join } from 'path';
import { initialize, enable } from '@electron/remote/main/index.js';
import Store from 'electron-store';

initialize();

// Window Constants
const WINDOW_MIN_WIDTH = 1280;
const WINDOW_MIN_HEIGHT = 800;

// For electron-store Type-Safety
type SchemaType = {
    dimensions: {
        width: number,
        height: number
    },
    position: {
        x: number,
        y: number
    }
};

const windowStore = new Store<SchemaType>({ schema: {
    dimensions: {
        type: 'object',
        properties: {
            width: {
                type: 'number',
                minimum: WINDOW_MIN_WIDTH,
                default: WINDOW_MIN_WIDTH
            },
            height: {
                type: 'number',
                minimum: WINDOW_MIN_HEIGHT,
                default: WINDOW_MIN_HEIGHT
            },
        },
        required: ['width', 'height']
    },
    position: {
        type: 'object',
        properties: {
            x: {
                type: 'number'
            },
            y: {
                type: 'number'
            }
        },
        required: ['x', 'y']
    }
}});

let mainWindow: BrowserWindow | null = null;

function createWindow() {
    if(!app.requestSingleInstanceLock()) {

        // Don't show dialog box if we are passing arguments to the first instance
        const launchAppArg = process.argv.find(arg => arg.startsWith('--launch-app='));
        if (!launchAppArg) {  // This has been rewritten
            // Show the dialog ONLY if it's not a request to launch an app
            // @ts-ignore property "window" is optional, see: [dialog.showMessageBoxSync](https://www.electronjs.org/docs/latest/api/dialog#dialogshowmessageboxsyncwindow-options)''
            dialog.showMessageBoxSync(null, {
                type: "error",
                buttons: ["Close"],
                title: "WinBoat",
                message: "An instance of WinBoat is already running.\n\tMultiple Instances are not allowed."
            });
        }
        app.exit();
        return; // fk you I forgot to add you and you made me go crazy for 20 mins
    }

    mainWindow = new BrowserWindow({
        minWidth: WINDOW_MIN_WIDTH,
        minHeight: WINDOW_MIN_HEIGHT,
        width: windowStore.get('dimensions.width'),
        height: windowStore.get('dimensions.height'),
        x: windowStore.get('position.x'),
        y: windowStore.get('position.y'),
        transparent: false,
        frame: false,
        webPreferences: {
            // preload: join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    mainWindow.on('close', () => {
        const bounds = mainWindow?.getBounds();

        windowStore.set('dimensions', {
            width: bounds?.width,
            height: bounds?.height
        });

        windowStore.set('position', {
            x: bounds?.x,
            y: bounds?.y
        });
    });

    enable(mainWindow.webContents);

    if (process.env.NODE_ENV === 'development') {
        const rendererPort = process.argv[2];
        mainWindow.loadURL(`http://localhost:${rendererPort}`);
    }
    else {
        mainWindow.loadFile(join(app.getAppPath(), 'renderer', 'index.html'));
    }
}

// Handling pending launch - bl4ckk
let pendingAppLaunch: string | null = null;
let rendererReady = false;

// Handler for ready renderer -bl4ckk
ipcMain.on('winboat-ready', () => {
    console.log('[Main] Renderer is ready');
    rendererReady = true;

    // Se c'è un lancio app in sospeso, invialo ora
    if (pendingAppLaunch && mainWindow) {
        console.log('[Main] Sending pending app launch:', pendingAppLaunch);
        mainWindow.webContents.send('launch-app-from-cli', pendingAppLaunch);
        pendingAppLaunch = null;
    }
});

// Helper for managing app launch
function handleAppLaunch(commandLine: string[]) {
    const launchAppArg = commandLine.find(arg => arg.startsWith('--launch-app='));
    if (!launchAppArg) return;

    const appPath = launchAppArg.substring('--launch-app='.length);
    console.log('[Main] App launch requested:', appPath);

    if (rendererReady && mainWindow) {
        mainWindow.webContents.send('launch-app-from-cli', appPath);
    } else {
        console.log('[Main] Renderer not ready, queuing launch');
        pendingAppLaunch = appPath;
    }
}

// New stuff for app creation - bl4ckk
import * as path from 'path';
import * as fs from 'fs';

app.whenReady().then(() => {

    const WINBOAT_DIR = path.join(app.getPath('home'), '.winboat');
    const binaryPathFile = path.join(WINBOAT_DIR, 'winboat_binary_path'); // bl4ckk

    if (!fs.existsSync(WINBOAT_DIR)) {
      fs.mkdirSync(WINBOAT_DIR, { recursive: true });
    }

    // Detect if running from AppImage - bl4ckk
    const binaryPath = process.env.APPIMAGE || process.execPath;

    fs.writeFileSync(binaryPathFile, binaryPath, 'utf-8');

    createWindow();

    // Finally handle the launch - bl4ckk
    handleAppLaunch(process.argv);

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                // 'Content-Security-Policy': ['script-src \'self\'']
                'Content-Security-Policy': [
                    "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' 'unsafe-inline'",
                    "worker-src 'self' blob:",
                    "media-src 'self' blob:",
                    "font-src 'self' 'unsafe-inline' https://fonts.gstatic.com;",
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"
                ]
            }
        })
    })

    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
});

// New second instance handling to support --launch-app -bl4ckk
app.on("second-instance", (event, commandLine, workingDirectory) => {
    if(mainWindow) {
        mainWindow.focus();
    }
    handleAppLaunch(commandLine);
});


ipcMain.on('message', (event, message) => {
    console.log(message);
})
