import type { WinApp } from "../../types";
import { logger } from "./winboat";
import { WinboatConfig } from "./config";

const fs: typeof import("fs") = require("node:fs");
const path: typeof import("path") = require("node:path");
const os: typeof import("os") = require("node:os");
const { promisify }: typeof import("util") = require("node:util");
const { exec }: typeof import("child_process") = require("node:child_process");
const remote: typeof import("@electron/remote") = require("@electron/remote");
const { dialog }: typeof import("@electron/remote") = require("@electron/remote");

const execAsync = promisify(exec);

/**
 * Manages Linux desktop shortcuts (.desktop files) for Windows applications
 */
export class DesktopShortcutsManager {
    private static instance: DesktopShortcutsManager | null = null;
    private readonly desktopDir: string;
    private readonly winboatIconPath: string;
    private readonly wbConfig: WinboatConfig;

    private constructor() {
        // Standard location for user desktop entries
        this.desktopDir = path.join(os.homedir(), ".local", "share", "applications");

        // Ensure the directory exists
        if (!fs.existsSync(this.desktopDir)) {
            fs.mkdirSync(this.desktopDir, { recursive: true });
            logger.info(`Created desktop applications directory: ${this.desktopDir}`);
        }

        // Path to Winboat's icon (used as fallback)
        this.winboatIconPath = "winboat"; // Will use system-installed icon or fallback to app icon

        // Get config instance
        this.wbConfig = WinboatConfig.getInstance();
    }

    static getInstance(): DesktopShortcutsManager {
        if (!DesktopShortcutsManager.instance) {
            DesktopShortcutsManager.instance = new DesktopShortcutsManager();
        }
        return DesktopShortcutsManager.instance;
    }

    /**
     * Prompts the user to select the WinBoat executable
     * @returns The selected path or null if cancelled
     */
    private async promptForWinboatExecutable(): Promise<string | null> {
        const result = await dialog.showOpenDialog(remote.getCurrentWindow(), {
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

        // Verify the file exists and is executable
        if (fs.existsSync(selectedPath)) {
            try {
                fs.accessSync(selectedPath, fs.constants.X_OK);
                logger.info(`User selected WinBoat executable: ${selectedPath}`);
                return selectedPath;
            } catch {
                logger.error(`Selected file is not executable: ${selectedPath}`);
                return null;
            }
        }

        return null;
    }

    /**
     * Determines the correct path to the Winboat executable
     * Handles both development and production modes, and asks user if needed
     * @returns The path to use in .desktop files
     */
    /**
     * Ensures the development wrapper script exists and returns its path
     */
    private async ensureDevWrapper(): Promise<string> {
        const app = remote.app;
        logger.info("Creating/Updating development wrapper");
        const wrapperPath = path.join(os.homedir(), ".local", "bin", "winboat-dev-wrapper.sh");
        const wrapperDir = path.dirname(wrapperPath);

        // Ensure the directory exists
        if (!fs.existsSync(wrapperDir)) {
            fs.mkdirSync(wrapperDir, { recursive: true });
        }

        // Create a wrapper script that properly launches Winboat in dev mode
        const appPath = app.getAppPath();
        // In dev mode, appPath points to build/main, but we need the project root
        // Go up two levels: build/main -> build -> project-root
        const projectRoot = path.resolve(appPath, "..", "..");
        const electronPath = process.execPath;
        const mainJsPath = path.join(projectRoot, "build", "main", "main.js");

        // In development mode, shortcuts work differently:
        // They rely on Winboat already being running (via npm run dev)
        // and use the single-instance lock to send the launch command
        const wrapperContent = `#!/bin/bash
# Winboat development mode wrapper script
# This script requires Winboat to already be running via 'npm run dev'

# Check if Winboat is already running
if pgrep -f "build/main/main.js" > /dev/null; then
    # Winboat is running, pass the launch-app argument
    # The existing instance will handle it via second-instance event
    cd "${projectRoot}"
    "${electronPath}" "${mainJsPath}" "$@"
else
    # Winboat is not running - show a notification
    if command -v notify-send > /dev/null; then
        notify-send "Winboat" "Please start Winboat in development mode first (npm run dev)" -u normal -t 5000
    fi
    echo "Error: Winboat is not running in development mode."
    echo "Please start it first with: npm run dev"
    echo ""
    echo "In development mode, shortcuts require Winboat to already be running."
    exit 1
fi
`;

        fs.writeFileSync(wrapperPath, wrapperContent, { mode: 0o755 });
        logger.info(`Created development wrapper script at: ${wrapperPath}`);

        // Save to config
        this.wbConfig.config.winboatExecutablePath = wrapperPath;

        return wrapperPath;
    }

    /**
     * Determines the correct path to the Winboat executable
     * Handles both development and production modes, and asks user if needed
     * @returns The path to use in .desktop files
     */
    private async getWinboatExecutablePath(): Promise<string> {
        const app = remote.app;
        // Both conditions must be true for dev mode: NOT packaged AND NODE_ENV is "development"
        const isDevelopment = !app.isPackaged && process.env.NODE_ENV === "development";
        console.log(`Debug: getWinboatExecutablePath called. app.isPackaged=${app.isPackaged}, NODE_ENV=${process.env.NODE_ENV}, isDevelopment=${isDevelopment}`);
        logger.info(`Debug: app.isPackaged=${app.isPackaged}, NODE_ENV=${process.env.NODE_ENV}, isDevelopment=${isDevelopment}`);

        // 1. In development mode, ALWAYS use the wrapper script
        if (isDevelopment) {
            return this.ensureDevWrapper();
        }

        // 2. Check if user has already specified a custom path (but NOT the dev wrapper in production)
        if (this.wbConfig.config.winboatExecutablePath) {
            const customPath = this.wbConfig.config.winboatExecutablePath;
            // Skip dev wrapper paths in production mode
            if (customPath.includes("winboat-dev-wrapper")) {
                logger.warn(`Ignoring dev wrapper path in production mode: ${customPath}`);
                this.wbConfig.config.winboatExecutablePath = undefined;
            } else if (fs.existsSync(customPath)) {
                logger.info(`Using custom WinBoat executable from config: ${customPath}`);
                return customPath;
            } else {
                logger.warn(`Configured WinBoat path no longer exists: ${customPath}`);
                // Clear the invalid path
                this.wbConfig.config.winboatExecutablePath = undefined;
            }
        }

        // 3. Check if we're running in packaged/production mode
        if (app.isPackaged) {
            // When running from an AppImage, APPIMAGE env var contains the real AppImage path
            // Using app.getPath("exe") would return the temporary mount path like /tmp/.mount_*/winboat
            // which becomes invalid after the AppImage is closed
            const appImagePath = process.env.APPIMAGE;
            if (appImagePath && fs.existsSync(appImagePath)) {
                logger.info(`Running from AppImage, using APPIMAGE path: ${appImagePath}`);
                this.wbConfig.config.winboatExecutablePath = appImagePath;
                return appImagePath;
            }

            // Fallback to exe path for non-AppImage packaged builds
            const exePath = app.getPath("exe");
            logger.info(`Using packaged executable: ${exePath}`);
            // Save to config for future use
            this.wbConfig.config.winboatExecutablePath = exePath;
            return exePath;
        }

        // 4. Ask the user to locate WinBoat (Fallback for weird production cases)
        const userSelectedPath = await this.promptForWinboatExecutable();
        if (userSelectedPath) {
            // Save to config
            this.wbConfig.config.winboatExecutablePath = userSelectedPath;
            return userSelectedPath;
        }

        throw new Error("Could not determine WinBoat executable path");
    }

    /**
     * Creates or updates a desktop shortcut for a Windows app
     * @param app The Windows application
     * @param winboatExecutable Path to the Winboat executable (for launching)
     * @returns Promise that resolves when the shortcut is created
     */
    async createShortcut(app: WinApp, winboatExecutable?: string): Promise<void> {
        console.log("Debug: createShortcut called for", app.Name, "with executable:", winboatExecutable);
        // If no executable provided, try to determine the correct path
        if (!winboatExecutable) {
            winboatExecutable = await this.getWinboatExecutablePath();
        }
        try {
            const desktopFileName = this.getDesktopFileName(app);
            const desktopFilePath = path.join(this.desktopDir, desktopFileName);

            // Save app icon if it exists
            const iconPath = await this.saveAppIcon(app);

            // Create the .desktop file content
            const desktopFileContent = this.generateDesktopFileContent(app, winboatExecutable, iconPath);

            // Write the .desktop file
            fs.writeFileSync(desktopFilePath, desktopFileContent, "utf-8");

            // Make it executable
            fs.chmodSync(desktopFilePath, 0o755);

            logger.info(`Created desktop shortcut for ${app.Name} at ${desktopFilePath}`);

            // Update desktop database to make the shortcut appear immediately
            await this.updateDesktopDatabase();
        } catch (error) {
            logger.error(`Failed to create desktop shortcut for ${app.Name}:`, error);
            throw error;
        }
    }

    /**
     * Removes a desktop shortcut for a Windows app
     * @param app The Windows application
     * @returns Promise that resolves when the shortcut is removed
     */
    async removeShortcut(app: WinApp): Promise<void> {
        try {
            const desktopFileName = this.getDesktopFileName(app);
            const desktopFilePath = path.join(this.desktopDir, desktopFileName);

            if (fs.existsSync(desktopFilePath)) {
                fs.unlinkSync(desktopFilePath);
                logger.info(`Removed desktop shortcut for ${app.Name}`);
            }

            // Also remove the saved icon
            await this.removeAppIcon(app);

            // Update desktop database
            await this.updateDesktopDatabase();
        } catch (error) {
            logger.error(`Failed to remove desktop shortcut for ${app.Name}:`, error);
            throw error;
        }
    }

    /**
     * Checks if a desktop shortcut exists for an app
     * @param app The Windows application
     * @returns True if a shortcut exists
     */
    hasShortcut(app: WinApp): boolean {
        const desktopFileName = this.getDesktopFileName(app);
        const desktopFilePath = path.join(this.desktopDir, desktopFileName);
        return fs.existsSync(desktopFilePath);
    }

    /**
     * Allows the user to manually select/update the WinBoat executable path
     * Useful if the executable was moved or user wants to change it
     * @returns True if a new path was selected and saved
     */
    async updateWinboatExecutablePath(): Promise<boolean> {
        const newPath = await this.promptForWinboatExecutable();
        if (newPath) {
            this.wbConfig.config.winboatExecutablePath = newPath;
            logger.info(`Updated WinBoat executable path to: ${newPath}`);
            return true;
        }
        return false;
    }

    /**
     * Gets the currently configured WinBoat executable path
     * @returns The path or null if not yet configured
     */
    getCurrentExecutablePath(): string | undefined {
        return this.wbConfig.config.winboatExecutablePath;
    }

    /**
     * Removes all Winboat desktop shortcuts
     */
    async removeAllShortcuts(): Promise<void> {
        try {
            const files = fs.readdirSync(this.desktopDir);
            const winboatShortcuts = files.filter(file => file.startsWith("winboat-"));

            for (const shortcut of winboatShortcuts) {
                const filePath = path.join(this.desktopDir, shortcut);
                fs.unlinkSync(filePath);
                logger.info(`Removed desktop shortcut: ${shortcut}`);
            }

            // Remove all saved icons
            const iconsDir = this.getIconsDir();
            if (fs.existsSync(iconsDir)) {
                fs.rmSync(iconsDir, { recursive: true, force: true });
                logger.info(`Removed all saved app icons from: ${iconsDir}`);
            }

            await this.updateDesktopDatabase();
        } catch (error) {
            logger.error("Failed to remove all shortcuts:", error);
            throw error;
        }
    }

    /**
     * Generates the sanitized filename for a .desktop file
     * @param app The Windows application
     * @returns The desktop file name
     */
    private getDesktopFileName(app: WinApp): string {
        // Sanitize app name for use in filename
        const sanitizedName = app.Name.replace(/[^a-zA-Z0-9-_]/g, "-")
            .replace(/-+/g, "-")
            .toLowerCase();

        return `winboat-${sanitizedName}.desktop`;
    }

    /**
     * Generates the content for a .desktop file
     * @param app The Windows application
     * @param winboatExecutable Path to Winboat executable
     * @param iconPath Path to the app's icon
     * @returns The .desktop file content
     */
    private generateDesktopFileContent(app: WinApp, winboatExecutable: string, iconPath: string): string {
        // Clean the app name for display
        const displayName = app.Name.replace(/^[⚙️🖥️]\s*/, ""); // Remove emoji prefixes

        // Create a description based on the app source
        let description = "Windows application";
        switch (app.Source) {
            case "custom":
                description = "Custom Windows application (via Winboat)";
                break;
            case "internal":
                description = "Winboat internal application";
                break;
            case "winreg":
                description = "Windows Registry application (via Winboat)";
                break;
            case "startmenu":
                description = "Windows Start Menu application (via Winboat)";
                break;
            case "uwp":
                description = "Microsoft Store application (via Winboat)";
                break;
            default:
                description = "Windows application (via Winboat)";
        }

        // Escape the app name for use in the --launch-app= argument
        // We need to escape quotes and backslashes for proper shell handling
        const escapedAppName = app.Name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

        return `[Desktop Entry]
Version=1.0
Type=Application
Name=${displayName}
Comment=${description}
Exec=${winboatExecutable} --launch-app-name="${escapedAppName}"
Icon=${iconPath}
Categories=Winboat;Windows;
Terminal=false
StartupNotify=true
StartupWMClass=winboat-${displayName.toLowerCase().replace(/[^a-z0-9]/g, "-")}
`;
    }

    /**
     * Saves the app icon to disk and returns the path
     * @param app The Windows application
     * @returns The path to the saved icon
     */
    private async saveAppIcon(app: WinApp): Promise<string> {
        try {
            const iconsDir = this.getIconsDir();

            // Ensure icons directory exists
            if (!fs.existsSync(iconsDir)) {
                fs.mkdirSync(iconsDir, { recursive: true });
            }

            // Generate icon filename
            const sanitizedName = app.Name.replace(/[^a-zA-Z0-9-_]/g, "-")
                .replace(/-+/g, "-")
                .toLowerCase();
            const iconFileName = `winboat-${sanitizedName}.png`;
            const iconPath = path.join(iconsDir, iconFileName);

            // If app has an icon, save it
            if (app.Icon) {
                // Icon might be base64 encoded or a data URL
                let iconData: Buffer;

                if (app.Icon.startsWith("data:image")) {
                    // Extract base64 data from data URL
                    const base64Data = app.Icon.split(",")[1] || app.Icon.split(";base64,")[1];
                    iconData = Buffer.from(base64Data, "base64");
                } else {
                    // Assume it's already base64
                    iconData = Buffer.from(app.Icon, "base64");
                }

                fs.writeFileSync(iconPath, iconData);
                return iconPath;
            }

            // Fallback to Winboat icon
            return this.winboatIconPath;
        } catch (error) {
            logger.error(`Failed to save icon for ${app.Name}:`, error);
            return this.winboatIconPath;
        }
    }

    /**
     * Removes the saved icon for an app
     * @param app The Windows application
     */
    private async removeAppIcon(app: WinApp): Promise<void> {
        try {
            const iconsDir = this.getIconsDir();
            const sanitizedName = app.Name.replace(/[^a-zA-Z0-9-_]/g, "-")
                .replace(/-+/g, "-")
                .toLowerCase();
            const iconFileName = `winboat-${sanitizedName}.png`;
            const iconPath = path.join(iconsDir, iconFileName);

            if (fs.existsSync(iconPath)) {
                fs.unlinkSync(iconPath);
                logger.info(`Removed icon for ${app.Name}`);
            }
        } catch (error) {
            logger.error(`Failed to remove icon for ${app.Name}:`, error);
        }
    }

    /**
     * Gets the directory where app icons are stored
     * @returns The icons directory path
     */
    private getIconsDir(): string {
        return path.join(os.homedir(), ".local", "share", "winboat", "icons");
    }

    /**
     * Updates the desktop database to make shortcuts appear immediately
     */
    private async updateDesktopDatabase(): Promise<void> {
        try {
            // Try to run update-desktop-database if available
            await execAsync(`update-desktop-database ${this.desktopDir}`).catch(() => {
                // Silently fail if command doesn't exist
                logger.info("update-desktop-database not available, shortcuts may need manual refresh");
            });
        } catch (error) {
            // Non-critical error, shortcuts will still work
            logger.info("Could not update desktop database, but shortcuts should still work");
        }
    }
}
