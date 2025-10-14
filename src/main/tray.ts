import { Tray, Menu, nativeImage, NativeImage, app, BrowserWindow, shell } from 'electron';
import { execSync } from 'child_process';
import { join } from 'path';
import Canvas from 'canvas';

let tray: Tray | null = null;
let trayUpdateInterval: NodeJS.Timer | null = null;

const CONTAINER_NAME = 'WinBoat';
const BASE_ICON_PATH = join(app.getAppPath(), '..', '..', 'icons', 'icon.png');
const WEB_UI_URL = 'http://localhost:8006';
const REFRESH_INTERVAL = 2000;
const ICON_SIZE = 64;

type Status = 'running' | 'paused' | 'stopped';
const STATUS_COLORS: Record<Status, string> = {
    running: '#00FF00',
    paused: '#0000FF',
    stopped: '#FF0000',
};

// Docker Helpers
function run(cmd: string) {
    try {
        execSync(cmd, { stdio: 'ignore' });
    } catch { }
}

function getContainerStatus(): Status {
    try {
        const output = execSync(`docker inspect -f '{{.State.Status}}' ${CONTAINER_NAME}`, {
            encoding: 'utf-8',
        }).trim();
        if (output === 'running' || output === 'paused') return output as Status;
        return 'stopped';
    } catch {
        return 'stopped';
    }
}

// Tray Icon
async function createStatusIcon(status: Status): Promise<NativeImage> {
    const canvas = Canvas.createCanvas(ICON_SIZE, ICON_SIZE);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);

    const image = await Canvas.loadImage(BASE_ICON_PATH);
    ctx.drawImage(image, 0, 0, ICON_SIZE, ICON_SIZE);

    const radius = ICON_SIZE / 4;
    const cx = ICON_SIZE - radius - 4;
    const cy = ICON_SIZE - radius - 4;

    ctx.fillStyle = STATUS_COLORS[status];
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    return nativeImage.createFromDataURL(canvas.toDataURL());
}

// Tray Actions
function startStop() {
    const status = getContainerStatus();
    if (status === 'running' || status === 'paused') run(`docker stop ${CONTAINER_NAME}`);
    else run(`docker start ${CONTAINER_NAME}`);
    refreshTray();
}

function playPause() {
    const status = getContainerStatus();
    if (status === 'running') run(`docker pause ${CONTAINER_NAME}`);
    else if (status === 'paused') run(`docker unpause ${CONTAINER_NAME}`);
    refreshTray();
}


function openWebUI() {
    shell.openExternal(WEB_UI_URL);
}

async function exitApp() {
    if (trayUpdateInterval) {
        clearInterval(trayUpdateInterval as unknown as number);
        trayUpdateInterval = null;
    }
    const status = getContainerStatus();
    if (status === 'running') run(`docker stop ${CONTAINER_NAME}`);
    if (tray) {
        tray.destroy();
        tray = null;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    app.exit(0);
}


// Refresh Tray
async function refreshTray() {
    if (!tray) return;
    const status = getContainerStatus();
    const icon = await createStatusIcon(status);
    tray.setImage(icon);
}

// Main Tray
export async function createTray(mainWindow?: BrowserWindow) {
    if (tray) return;

    const icon = await createStatusIcon(getContainerStatus());
    tray = new Tray(icon);
    tray.setToolTip('WinBoat');

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Start/Stop', click: startStop },
        { label: 'Play/Pause', click: playPause },
        { label: 'Open Web UI', click: openWebUI },
        { type: 'separator' },
        { label: 'Exit', click: exitApp },
    ]);

    tray.setContextMenu(contextMenu);

    // Click tray to toggle/focus window
    tray.on('click', () => {
        if (!mainWindow) return;
        if (!mainWindow.isVisible()) {
            mainWindow.show();
            mainWindow.focus();
        } else if (!mainWindow.isFocused()) {
            mainWindow.focus();
        } else {
            mainWindow.hide();
        }
    });

    // Prevent closing window from quitting app
    if (mainWindow) {
        mainWindow.on('close', (e) => {
            e.preventDefault();
            mainWindow.hide();
        });
    }

    trayUpdateInterval = setInterval(refreshTray, REFRESH_INTERVAL);

    app.on('window-all-closed', () => {
        // App stays alive in tray
    });
}
