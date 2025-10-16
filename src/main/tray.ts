import { Tray, Menu, nativeImage, NativeImage, app, BrowserWindow, Notification } from 'electron';
import { execSync } from 'child_process';
import { join } from 'path';
import Canvas from 'canvas';

let tray: Tray | null = null;
let trayUpdateInterval: NodeJS.Timer | null = null;

const CONTAINER_NAME = 'WinBoat';
const BASE_ICON_PATH = join(app.getAppPath(), '..', '..', 'icons', 'icon.png');
const ICON_SIZE = 64;
const REFRESH_INTERVAL = 1000;

type Status = 'running' | 'paused' | 'stopped';
const STATUS_COLORS: Record<Status, string> = {
    running: '#00FF00',
    paused: '#0000FF',
    stopped: '#FF0000',
};

// Docker Helpers
function run(cmd: string) {
    try {
        execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
    } catch (err) {
        const msg = (err as Error).message || '';   // to avoid log spam '[electron] Error: No such object: WinBoat'
        if (!msg.includes('No such object')) {
            console.error(`[Tray] Command failed: ${cmd}\n${msg}`);
        }
        // Otherwise ignore silently
    }
}


function getContainerStatus(): Status {
    try {
        const output = execSync(
            `docker inspect -f '{{.State.Status}}' ${CONTAINER_NAME} 2>/dev/null`,
            { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
        ).trim();

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

// Exit Logic
async function exitApp() {
    if (trayUpdateInterval) {
        clearInterval(trayUpdateInterval as unknown as number);
        trayUpdateInterval = null;
    }

    const status = getContainerStatus();
    if (status === 'running') {
        new Notification({
            title: 'WinBoat',
            body: 'WinBoat is running. Shutting it down now...',
        }).show();
        run(`docker stop ${CONTAINER_NAME}`);
    }

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

// Main Tray Creation
export async function createTray(mainWindow?: BrowserWindow) {
    if (tray) return;

    const icon = await createStatusIcon(getContainerStatus());
    tray = new Tray(icon);
    tray.setToolTip('WinBoat');

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Exit', click: exitApp },
    ]);
    tray.setContextMenu(contextMenu);

    // Tray click toggles window
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

    // Prevent window close from quitting
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
