#!/usr/bin/env node
/**
 * WinBoat Host App Sync
 * 
 * Fetches all Windows apps from the guest server and creates
 * desktop entries in the host's application menu so Windows apps
 * appear as native Linux applications.
 * 
 * Usage:
 *   node scripts/sync-host-apps.ts [--api-url <url>] [--clean]
 */

import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import { URL } from "url";
import * as os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface WinApp {
    Name: string;
    Path: string;
    Args: string;
    Icon: string;
    Source: string;
    Usage?: number;
}

const DESKTOP_DIR = path.join(os.homedir(), ".local", "share", "applications", "winboat");
const ICON_DIR = path.join(os.homedir(), ".local", "share", "icons", "winboat");

/**
 * Sanitize app name for use in filenames
 */
function sanitizeFileName(name: string): string {
    return name
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/_{2,}/g, "_")
        .replace(/^_|_$/g, "")
        .substring(0, 100); // Limit length
}

/**
 * Check if API is accessible
 */
async function checkApiStatus(apiUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
        const url = new URL(`${apiUrl}/health`);
        const client = url.protocol === "https:" ? https : http;
        
        const req = client.get(
            {
                hostname: url.hostname,
                port: url.port || (url.protocol === "https:" ? 443 : 80),
                path: url.pathname,
                timeout: 5000,
            },
            (res) => {
                resolve(res.statusCode === 200);
            }
        );
        
        req.on("error", () => resolve(false));
        req.on("timeout", () => {
            req.destroy();
            resolve(false);
        });
    });
}

/**
 * Fetch apps from guest server API
 */
async function fetchApps(apiUrl: string): Promise<WinApp[]> {
    return new Promise((resolve, reject) => {
        const url = new URL(`${apiUrl}/apps`);
        const client = url.protocol === "https:" ? https : http;
        
        const req = client.get(
            {
                hostname: url.hostname,
                port: url.port || (url.protocol === "https:" ? 443 : 80),
                path: url.pathname,
                timeout: 10000,
            },
            (res) => {
                let data = "";
                res.on("data", (chunk) => {
                    data += chunk;
                });
                res.on("end", () => {
                    if (res.statusCode === 200) {
                        try {
                            const apps = JSON.parse(data) as WinApp[];
                            resolve(apps);
                        } catch (error) {
                            reject(new Error(`Failed to parse API response: ${error}`));
                        }
                    } else {
                        reject(new Error(`API returned status ${res.statusCode}: ${data}`));
                    }
                });
            }
        );
        
        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy();
            reject(new Error("Request timeout"));
        });
    });
}

/**
 * Save icon from base64 to file
 */
async function saveIcon(appName: string, base64Icon: string): Promise<string | null> {
    if (!base64Icon || base64Icon.trim().length === 0) {
        return null;
    }
    
    try {
        // Remove data URL prefix if present
        const base64Data = base64Icon.replace(/^data:image\/[a-z]+;base64,/, "");
        const iconBuffer = Buffer.from(base64Data, "base64");
        
        const fileName = `${sanitizeFileName(appName)}.png`;
        const iconPath = path.join(ICON_DIR, fileName);
        
        // Ensure icon directory exists
        if (!fs.existsSync(ICON_DIR)) {
            fs.mkdirSync(ICON_DIR, { recursive: true });
        }
        
        fs.writeFileSync(iconPath, iconBuffer);
        return iconPath;
    } catch (error) {
        console.warn(`Failed to save icon for ${appName}: ${error}`);
        return null;
    }
}

/**
 * Create desktop entry file
 */
function createDesktopEntry(app: WinApp, iconPath: string | null): string {
    const safeName = sanitizeFileName(app.Name);
    const escapedName = app.Name.replace(/"/g, '\\"');
    
    // Get winboat command path (use the wrapper script if available, fallback to direct node call)
    let winboatCmd = path.join(os.homedir(), ".local", "bin", "winboat");
    if (!fs.existsSync(winboatCmd)) {
        // Fallback: use node to execute winboat-cli.ts directly
        const currentDir = path.dirname(new URL(import.meta.url).pathname);
        const winboatCliPath = path.join(currentDir, "winboat-cli.ts");
        // Use absolute path for desktop entries
        winboatCmd = `node "${winboatCliPath}"`;
    }
    // Ensure we use absolute path for desktop entries
    if (!path.isAbsolute(winboatCmd) && !winboatCmd.startsWith("node ")) {
        winboatCmd = path.resolve(winboatCmd);
    }
    
    // Use absolute icon path for desktop entries
    let iconValue = "application-x-executable";
    if (iconPath && fs.existsSync(iconPath)) {
        // Use absolute path for icons - desktop environments prefer this
        iconValue = iconPath;
    }
    
    // Build desktop entry content
    // Escape special characters in Exec command properly
    const execCmd = `${winboatCmd} -l "${escapedName}"`;
    
    const desktopEntry = `[Desktop Entry]
Version=1.0
Type=Application
Name=${app.Name}
Comment=Windows application via WinBoat
Exec=${execCmd}
Icon=${iconValue}
Terminal=false
Categories=X-WinBoat;
StartupNotify=true
MimeType=
Keywords=windows;winboat;
X-GNOME-Autostart-enabled=false
`;
    
    return desktopEntry;
}

/**
 * Sync apps to host desktop entries
 */
async function syncApps(apiUrl: string, clean: boolean = false): Promise<void> {
    console.log("Checking API status...");
    const isOnline = await checkApiStatus(apiUrl);
    
    if (!isOnline) {
        throw new Error(`WinBoat API is not accessible at ${apiUrl}. Make sure WinBoat is running.`);
    }
    
    console.log("✓ API is accessible");
    console.log("Fetching Windows apps...");
    
    const apps = await fetchApps(apiUrl);
    console.log(`✓ Found ${apps.length} Windows apps`);
    
    // Create directories
    if (!fs.existsSync(DESKTOP_DIR)) {
        fs.mkdirSync(DESKTOP_DIR, { recursive: true });
        console.log(`✓ Created directory: ${DESKTOP_DIR}`);
    }
    
    if (!fs.existsSync(ICON_DIR)) {
        fs.mkdirSync(ICON_DIR, { recursive: true });
        console.log(`✓ Created directory: ${ICON_DIR}`);
    }
    
    // Clean existing entries if requested
    if (clean) {
        console.log("Cleaning existing desktop entries...");
        const existingFiles = fs.readdirSync(DESKTOP_DIR);
        for (const file of existingFiles) {
            if (file.endsWith(".desktop")) {
                fs.unlinkSync(path.join(DESKTOP_DIR, file));
            }
        }
        console.log("✓ Cleaned existing entries");
    }
    
    // Process each app
    let successCount = 0;
    let skipCount = 0;
    
    for (const app of apps) {
        try {
            // Skip apps without names
            if (!app.Name || app.Name.trim().length === 0) {
                skipCount++;
                continue;
            }
            
            // Save icon
            const iconPath = await saveIcon(app.Name, app.Icon);
            
            // Create desktop entry
            const desktopEntry = createDesktopEntry(app, iconPath);
            const fileName = `${sanitizeFileName(app.Name)}.desktop`;
            const filePath = path.join(DESKTOP_DIR, fileName);
            
            fs.writeFileSync(filePath, desktopEntry, { encoding: "utf-8" });
            
            // Make executable (required for desktop entries)
            fs.chmodSync(filePath, 0o755);
            
            successCount++;
            
            if (successCount % 10 === 0) {
                process.stdout.write(".");
            }
        } catch (error) {
            console.warn(`\n⚠ Failed to process app "${app.Name}": ${error}`);
        }
    }
    
    // Create .directory file to define the WinBoat folder in application menu
    const directoryFile = path.join(DESKTOP_DIR, ".directory");
    const directoryContent = `[Desktop Entry]
Version=1.0
Type=Directory
Name=WinBoat
Icon=application-x-executable
Comment=Windows applications running via WinBoat
`;
    fs.writeFileSync(directoryFile, directoryContent, { encoding: "utf-8" });
    fs.chmodSync(directoryFile, 0o644);
    console.log(`✓ Created WinBoat folder definition`);
    
    // Update desktop database and icon cache
    console.log("\nUpdating desktop database and icon cache...");
    try {
        await execAsync("update-desktop-database ~/.local/share/applications/ 2>/dev/null || true");
        console.log("✓ Desktop database updated");
    } catch (error) {
        console.warn("⚠ Could not update desktop database (this is usually fine)");
    }
    
    try {
        // Update icon cache for the icon directory
        await execAsync(`gtk-update-icon-cache -f -t ~/.local/share/icons/winboat 2>/dev/null || true`);
        console.log("✓ Icon cache updated");
    } catch (error) {
        console.warn("⚠ Could not update icon cache (this is usually fine)");
    }
    
    console.log("\n=== Sync Complete ===");
    console.log(`✓ Created ${successCount} desktop entries`);
    if (skipCount > 0) {
        console.log(`⚠ Skipped ${skipCount} apps (invalid names)`);
    }
    console.log(`\nWindows apps are now available in your application menu under "WinBoat" category!`);
}

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);
    let apiUrl = "http://localhost:7148";
    let clean = false;
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--api-url" && i + 1 < args.length) {
            apiUrl = args[++i];
        } else if (args[i] === "--clean") {
            clean = true;
        } else if (args[i] === "-h" || args[i] === "--help") {
            console.log(`
WinBoat Host App Sync

Usage:
  node scripts/sync-host-apps.ts [options]

Options:
  --api-url <url>    Specify API URL (default: http://localhost:7148)
  --clean            Remove existing desktop entries before syncing
  -h, --help         Show this help message

This script fetches all Windows apps from the WinBoat guest server
and creates desktop entries in your Linux application menu.
            `);
            process.exit(0);
        }
    }
    
    // Normalize API URL
    if (apiUrl.endsWith("/")) {
        apiUrl = apiUrl.slice(0, -1);
    }
    
    try {
        await syncApps(apiUrl, clean);
    } catch (error: any) {
        console.error(`\n✗ Error: ${error.message}`);
        process.exit(1);
    }
}

// Check if this is the main module (ES module way)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('sync-host-apps.ts')) {
    main();
}

export { syncApps, fetchApps, checkApiStatus };

