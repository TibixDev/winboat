import { app } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { promisify } from "util";
import { exec } from "child_process";
import { dialog } from "electron";

const execAsync = promisify(exec);

// Simplified types for Main Process
interface WinApp {
    Name: string;
    Icon?: string;
    Source?: string;
    [key: string]: any;
}

export class DesktopShortcutsManager {
    private static instance: DesktopShortcutsManager | null = null;
    private readonly desktopDir: string;
    private readonly winboatIconPath: string;
    // We'll read config from disk since we can't depend on WinboatConfig (renderer)
    private readonly configPath: string;

    private constructor() {
        // Standard location for user desktop entries
        this.desktopDir = path.join(os.homedir(), ".local", "share", "applications");

        // Ensure the directory exists
        if (!fs.existsSync(this.desktopDir)) {
            fs.mkdirSync(this.desktopDir, { recursive: true });
            console.log(`Created desktop applications directory: ${this.desktopDir}`);
        }

        this.winboatIconPath = "winboat";
        this.configPath = path.join(os.homedir(), ".winboat", "config.yaml");
    }

    static getInstance(): DesktopShortcutsManager {
        if (!DesktopShortcutsManager.instance) {
            DesktopShortcutsManager.instance = new DesktopShortcutsManager();
        }
        return DesktopShortcutsManager.instance;
    }

    private getWinboatConfig(): any {
        try {
            // Need a YAML parser in main process? 
            // The renderer used 'yaml' package. Let's see if we can use it here.
            // If not, we might need to rely on 'electron-store' if that's what main.ts uses.
            // But config.ts suggests config is stored in YAML or separate file. 
            // For now, let's assume we can minimalistically read the config or use defaults.
            // Actually, main.ts uses electron-store but primarily for window state.
            // WinboatConfig in renderer manages the main config.
            return {};
        } catch (e) {
            return {};
        }
    }

    private async promptForWinboatExecutable(): Promise<string | null> {
        const result = await dialog.showOpenDialog({
            title: "Locate WinBoat Executable",
            message: "Please select the WinBoat executable to use for desktop shortcuts",
            properties: ["openFile"],
            filters: [
                { name: "Executables", extensions: [""] },
                { name: "All Files", extensions: ["*"] },
            ],
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }

        const selectedPath = result.filePaths[0];

        if (fs.existsSync(selectedPath)) {
            try {
                fs.accessSync(selectedPath, fs.constants.X_OK);
                return selectedPath;
            } catch {
                console.error(`Selected file is not executable: ${selectedPath}`);
                return null;
            }
        }

        return null;
    }

    private async ensureDevWrapper(): Promise<string> {
        console.log("Creating/Updating development wrapper");
        const wrapperPath = path.join(os.homedir(), ".local", "bin", "winboat-dev-wrapper.sh");
        const wrapperDir = path.dirname(wrapperPath);

        if (!fs.existsSync(wrapperDir)) {
            fs.mkdirSync(wrapperDir, { recursive: true });
        }

        // app.getAppPath() in dev: .../build/main
        const appPath = app.getAppPath();
        const projectRoot = path.resolve(appPath, "..", "..");
        const electronPath = process.execPath;
        const mainJsPath = path.join(projectRoot, "build", "main", "main.js");

        const wrapperContent = `#!/bin/bash
# Winboat development mode wrapper script

projectRoot="${projectRoot}"
electronPath="${electronPath}"
mainJsPath="${mainJsPath}"

cd "\${projectRoot}"
"\${electronPath}" "\${mainJsPath}" "$@"
`;

        fs.writeFileSync(wrapperPath, wrapperContent, { mode: 0o755 });
        return wrapperPath;
    }

    private async getWinboatExecutablePath(): Promise<string> {
        const isDevelopment = !app.isPackaged && process.env.NODE_ENV === "development";

        if (isDevelopment) {
            return this.ensureDevWrapper();
        }

        if (app.isPackaged) {
            const appImagePath = process.env.APPIMAGE;
            if (appImagePath && fs.existsSync(appImagePath)) {
                return appImagePath;
            }
            return app.getPath("exe");
        }

        // Fallback or user prompt logic could go here, simplified for now
        return process.execPath;
    }

    async createShortcut(appData: WinApp): Promise<void> {
        console.log("Creating shortcut for", appData.Name);
        try {
            const winboatExecutable = await this.getWinboatExecutablePath();
            const desktopFileName = this.getDesktopFileName(appData);
            const desktopFilePath = path.join(this.desktopDir, desktopFileName);
            const iconPath = await this.saveAppIcon(appData);

            const desktopFileContent = this.generateDesktopFileContent(appData, winboatExecutable, iconPath);

            fs.writeFileSync(desktopFilePath, desktopFileContent, "utf-8");
            fs.chmodSync(desktopFilePath, 0o755);

            console.log(`Created desktop shortcut at ${desktopFilePath}`);
            await this.updateDesktopDatabase();
        } catch (error) {
            console.error(`Failed to create desktop shortcut for ${appData.Name}:`, error);
            throw error;
        }
    }

    async removeShortcut(appData: WinApp): Promise<void> {
        try {
            const desktopFileName = this.getDesktopFileName(appData);
            const desktopFilePath = path.join(this.desktopDir, desktopFileName);

            if (fs.existsSync(desktopFilePath)) {
                fs.unlinkSync(desktopFilePath);
                console.log(`Removed desktop shortcut for ${appData.Name}`);
            }

            await this.removeAppIcon(appData);
            await this.updateDesktopDatabase();
        } catch (error) {
            console.error(`Failed to remove desktop shortcut for ${appData.Name}:`, error);
            throw error;
        }
    }

    hasShortcut(appData: WinApp): boolean {
        const desktopFileName = this.getDesktopFileName(appData);
        const desktopFilePath = path.join(this.desktopDir, desktopFileName);
        return fs.existsSync(desktopFilePath);
    }

    private sanitizeAppName(name: string): string {
        return name
            .replace(/^[⚙️🖥️]\s*/, "") // Remove known emojis
            // Remove generic non-ascii chars if needed, or just let the regex below handle it
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-") // Replace non-alnum with hyphen
            .replace(/-+/g, "-") // Collapse
            .replace(/^-+|-+$/g, ""); // Trim
    }

    private getDesktopFileName(app: WinApp): string {
        const sanitizedName = this.sanitizeAppName(app.Name);
        return `winboat-${sanitizedName}.desktop`;
    }

    private generateDesktopFileContent(app: WinApp, winboatExecutable: string, iconPath: string): string {
        const displayName = app.Name.replace(/^[⚙️🖥️]\s*/, "");
        const escapedAppName = app.Name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const sanitizedName = this.sanitizeAppName(app.Name);

        return `[Desktop Entry]
Version=1.0
Type=Application
Name=${displayName}
Comment=Windows application (via Winboat)
Exec="${winboatExecutable}" --launch-app-name="${escapedAppName}"
Icon=${iconPath}
Categories=Winboat;Windows;
Terminal=false
StartupNotify=true
StartupWMClass=winboat-${sanitizedName}
`;
    }

    private getIconsDir(): string {
        return path.join(os.homedir(), ".local", "share", "winboat", "icons");
    }

    private async saveAppIcon(app: WinApp): Promise<string> {
        try {
            const iconsDir = this.getIconsDir();
            if (!fs.existsSync(iconsDir)) {
                fs.mkdirSync(iconsDir, { recursive: true });
            }

            const sanitizedName = app.Name.replace(/[^a-zA-Z0-9-_]/g, "-")
                .replace(/-+/g, "-")
                .toLowerCase();
            const iconPath = path.join(iconsDir, `winboat-${sanitizedName}.png`);

            if (app.Icon) {
                let iconData: Buffer;
                if (app.Icon.startsWith("data:image")) {
                    const base64Data = app.Icon.split(",")[1] || app.Icon.split(";base64,")[1];
                    iconData = Buffer.from(base64Data, "base64");
                } else {
                    iconData = Buffer.from(app.Icon, "base64");
                }
                fs.writeFileSync(iconPath, iconData);
                return iconPath;
            }
            return this.winboatIconPath;
        } catch (error) {
            console.error("Failed to save icon:", error);
            return this.winboatIconPath;
        }
    }

    private async removeAppIcon(app: WinApp): Promise<void> {
        try {
            const iconsDir = this.getIconsDir();
            const sanitizedName = app.Name.replace(/[^a-zA-Z0-9-_]/g, "-")
                .replace(/-+/g, "-")
                .toLowerCase();
            const iconPath = path.join(iconsDir, `winboat-${sanitizedName}.png`);
            if (fs.existsSync(iconPath)) {
                fs.unlinkSync(iconPath);
            }
        } catch (error) {
            console.error("Failed to remove icon:", error);
        }
    }

    private async updateDesktopDatabase(): Promise<void> {
        try {
            await execAsync(`update-desktop-database ${this.desktopDir}`).catch(() => { });
        } catch { }
    }
}
