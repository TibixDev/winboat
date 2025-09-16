import { app, BrowserWindow, ipcMain, session, dialog } from 'electron';
import { join } from 'path';
import { initialize, enable } from '@electron/remote/main';

initialize();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
    if(!app.requestSingleInstanceLock()) {
        // @ts-ignore property "window" is optional, see: [dialog.showMessageBoxSync](https://www.electronjs.org/docs/latest/api/dialog#dialogshowmessageboxsyncwindow-options)
        dialog.showMessageBoxSync(null, {
            type: "error",
            buttons: ["Close"],
            title: "WinBoat",
            message: "An instance of WinBoat is already running.\n\tMultiple Instances are not allowed."
        });
        app.exit();
    }

    mainWindow = new BrowserWindow({
        minWidth: 1280,
        minHeight: 800,
        width: 1280,
        height: 800,
        y: 0,
        x: 500,
        transparent: false,
        frame: false,
        webPreferences: {
            // preload: join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    enable(mainWindow.webContents);

    if (process.env.NODE_ENV === 'development') {
        const rendererPort = process.argv[2];
        mainWindow.loadURL(`http://localhost:${rendererPort}`);
    }
    else {
        mainWindow.loadFile(join(app.getAppPath(), '..', 'renderer', 'index.html'));
    }
}

app.whenReady().then(() => {
    createWindow();

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

app.on("second-instance", _ => {
    if(mainWindow) {
        mainWindow.focus();
    }
})

ipcMain.on('message', (event, message) => {
    console.log(message);
})