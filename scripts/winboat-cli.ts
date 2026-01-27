#!/usr/bin/env node
/**
 * WinBoat CLI - Command Line Interface
 * 
 * Provides native-like Windows application management from Linux terminal
 * 
 * Features:
 * - Auto-detects running WinBoat container (Docker/Podman)
 * - Auto-discovers API and RDP ports from container
 * - Install apps with FreeRDP GUI launcher
 * - Launch apps seamlessly in existing or new RDP sessions
 * - Status monitoring and app listing
 */

import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import * as net from "net";
import { URL } from "url";
import FormData from "form-data";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as os from "os";
import YAML from "yaml";

const execAsync = promisify(exec);

// ============================================================================
// Type Definitions
// ============================================================================

interface CliOptions {
    install?: string;
    launch?: string;
    list?: boolean;
    status?: boolean;
    apiUrl?: string;
}

interface WinApp {
    Name: string;
    Path: string;
    Args: string;
    Icon: string;
    Source: string;
    Usage?: number;
}

interface ContainerInfo {
    running: boolean;
    exists: boolean;
    name?: string;
    runtime?: "docker" | "podman";
}

interface PortInfo {
    api?: number;
    rdp?: number;
}

interface FreeRDPInfo {
    command: string;
    args: string[];
}

// ============================================================================
// CLI Argument Parser
// ============================================================================

function parseArgs(): CliOptions {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
        showHelp();
        process.exit(0);
    }

    const options: CliOptions = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
            case "-i":
            case "--install":
                if (i + 1 >= args.length) {
                    console.error("Error: -i/--install requires a file path");
                    process.exit(1);
                }
                options.install = args[++i];
                break;

            case "-l":
            case "--launch":
                if (i + 1 >= args.length) {
                    console.error("Error: -l/--launch requires an app name");
                    process.exit(1);
                }
                options.launch = args[++i];
                break;

            case "--list":
            case "-ls":
                options.list = true;
                break;

            case "--status":
            case "-s":
                options.status = true;
                break;

            case "--api-url":
                if (i + 1 >= args.length) {
                    console.error("Error: --api-url requires a URL");
                    process.exit(1);
                }
                options.apiUrl = args[++i];
                break;

            default:
                console.error(`Error: Unknown option: ${arg}`);
                console.error("Use -h or --help for usage information");
                process.exit(1);
        }
    }

    return options;
}

function showHelp() {
    console.log(`
WinBoat CLI - Command Line Interface

Usage:
  winboat [options]

Options:
  -i, --install <path>     Install an application (.exe or .msi)
  -l, --launch <name>      Launch an application by name
  --list, -ls              List all available applications
  --status, -s             Check WinBoat container and API status
  --api-url <url>          Specify custom API URL
  -h, --help               Show this help message

Examples:
  winboat -i ~/Downloads/app.msi
  winboat -l "Google Chrome"
  winboat --list
  winboat --status

Note: To add shortcuts to your application menu, use the WinBoat GUI.
Right-click on any app and select "Add to Application Menu".
`);
}

// ============================================================================
// Container Detection & Port Discovery
// ============================================================================

async function detectContainer(): Promise<ContainerInfo> {
    // Try Docker first
    try {
        const { stdout } = await execAsync("docker ps -a --filter name=WinBoat --format '{{.Names}}|{{.Status}}'");
        if (stdout.trim()) {
            const [name, status] = stdout.trim().split("|");
            return {
                running: status.toLowerCase().includes("up"),
                exists: true,
                name: name || "WinBoat",
                runtime: "docker",
            };
        }
    } catch { }

    // Try Podman
    try {
        const { stdout } = await execAsync("podman ps -a --filter name=WinBoat --format '{{.Names}}|{{.Status}}'");
        if (stdout.trim()) {
            const [name, status] = stdout.trim().split("|");
            return {
                running: status.toLowerCase().includes("up"),
                exists: true,
                name: name || "WinBoat",
                runtime: "podman",
            };
        }
    } catch { }

    return { running: false, exists: false };
}

async function discoverPorts(container: ContainerInfo): Promise<PortInfo> {
    if (!container.exists || !container.runtime) {
        return {};
    }

    const runtime = container.runtime;
    const ports: PortInfo = {};

    try {
        // Get actual port mappings from container
        const { stdout } = await execAsync(`${runtime} port ${container.name} 2>/dev/null || true`);

        if (stdout.trim()) {
            const lines = stdout.trim().split('\n');

            for (const line of lines) {
                // Parse API port (7148)
                if (line.includes('7148')) {
                    const match = line.match(/7148\/tcp\s*->\s*(?:\d+\.\d+\.\d+\.\d+:)?(\d+)/);
                    if (match) {
                        ports.api = parseInt(match[1]);
                    }
                }

                // Parse RDP port (3389)
                if (line.includes('3389/tcp')) {
                    const match = line.match(/3389\/tcp\s*->\s*(?:\d+\.\d+\.\d+\.\d+:)?(\d+)/);
                    if (match) {
                        ports.rdp = parseInt(match[1]);
                    }
                }
            }
        }
    } catch (error) {
        console.error(`Warning: Failed to discover ports: ${error}`);
    }

    // Fallback: Try to read from compose file
    if (!ports.api || !ports.rdp) {
        try {
            const composePath = path.join(os.homedir(), ".winboat", "docker-compose.yml");
            if (fs.existsSync(composePath)) {
                const compose = YAML.parse(fs.readFileSync(composePath, "utf-8"));
                const portMappings = compose.services?.windows?.ports || [];

                for (const mapping of portMappings) {
                    if (typeof mapping === "string") {
                        // API port
                        if (mapping.includes(":7148")) {
                            const match = mapping.match(/:([\d]+)(?:-[\d]+)?:7148/);
                            if (match && !ports.api) {
                                ports.api = parseInt(match[1]);
                            }
                        }
                        // RDP port
                        if (mapping.includes(":3389")) {
                            const match = mapping.match(/:([\d]+)(?:-[\d]+)?:3389/);
                            if (match && !ports.rdp) {
                                ports.rdp = parseInt(match[1]);
                            }
                        }
                    }
                }
            }
        } catch { }
    }

    return ports;
}

async function checkGuestServerRunning(container: ContainerInfo): Promise<boolean> {
    if (!container.exists || !container.runtime || !container.name) {
        return false;
    }

    try {
        const { stdout } = await execAsync(
            `${container.runtime} exec ${container.name} tasklist /FI "IMAGENAME eq winboat_guest_server.exe" 2>/dev/null || true`
        );
        return stdout.includes("winboat_guest_server.exe");
    } catch {
        return false;
    }
}

// ============================================================================
// Network & API Functions
// ============================================================================

async function testPortConnectivity(port: number, verbose: boolean = false): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(3000);

        socket.once("connect", () => {
            socket.destroy();
            if (verbose) console.log(`  ✓ Port ${port} is accepting connections`);
            resolve(true);
        });

        socket.once("timeout", () => {
            socket.destroy();
            if (verbose) console.log(`  ✗ Port ${port} connection timeout`);
            resolve(false);
        });

        socket.once("error", () => {
            resolve(false);
        });

        socket.connect(port, "127.0.0.1");
    });
}

async function makeRequest(url: string, method: string = "GET", body?: any): Promise<{ statusCode: number; data: string }> {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === "https:" ? https : http;

        const options: any = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: method,
        };

        if (body && body.getHeaders) {
            options.headers = body.getHeaders();
        }

        const req = client.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => data += chunk);
            res.on("end", () => resolve({ statusCode: res.statusCode || 200, data }));
        });

        req.on("error", reject);
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error("Request timeout"));
        });

        if (body?.pipe) {
            body.pipe(req);
        } else {
            if (body) req.write(body);
            req.end();
        }
    });
}

async function checkApiHealth(apiUrl: string, verbose: boolean = false): Promise<boolean> {
    try {
        const urlObj = new URL(apiUrl);
        const port = parseInt(urlObj.port || "80");

        if (verbose) {
            console.log(`  Testing connectivity to ${urlObj.hostname}:${port}...`);
        }

        const response = await makeRequest(`${apiUrl}/health`);

        if (verbose && response.statusCode === 200) {
            console.log(`  ✓ API is healthy and responding`);
        }

        return response.statusCode === 200;
    } catch (error: any) {
        if (verbose) {
            console.log(`  ✗ API health check failed: ${error.message}`);
        }
        return false;
    }
}

// ============================================================================
// FreeRDP Detection
// ============================================================================

async function findFreeRDP(): Promise<FreeRDPInfo | null> {
    const candidates = [
        { command: "xfreerdp3", args: [] },
        { command: "xfreerdp", args: [] },
        { command: "flatpak", args: ["run", "--command=xfreerdp", "com.freerdp.FreeRDP"] },
    ];

    for (const candidate of candidates) {
        try {
            const args = candidate.args.length > 0
                ? [...candidate.args, "--version"]
                : ["--version"];
            const { stdout } = await execAsync(`${candidate.command} ${args.join(" ")}`);

            if (stdout.includes("version 3.")) {
                return candidate;
            }
        } catch { }
    }

    return null;
}

// ============================================================================
// App Management Functions
// ============================================================================

async function getApps(apiUrl: string): Promise<WinApp[]> {
    try {
        const response = await makeRequest(`${apiUrl}/apps`);
        if (response.statusCode === 200) {
            return JSON.parse(response.data) as WinApp[];
        }
        throw new Error(`API returned status ${response.statusCode}`);
    } catch (error: any) {
        throw new Error(`Failed to fetch apps: ${error.message}`);
    }
}

async function listApps(apiUrl: string): Promise<void> {
    console.log("\nFetching installed applications...\n");

    const apps = await getApps(apiUrl);

    if (apps.length === 0) {
        console.log("No applications found.");
        return;
    }

    console.log(`Found ${apps.length} application(s):\n`);

    apps.forEach((app, index) => {
        console.log(`${index + 1}. ${app.Name}`);
        console.log(`   Path: ${app.Path}`);
        console.log(`   Source: ${app.Source}`);
        if (app.Args) {
            console.log(`   Args: ${app.Args}`);
        }
        console.log();
    });
}

// ============================================================================
// Installation Function
// ============================================================================

async function installApp(apiUrl: string, installerPath: string, rdpPort: number): Promise<void> {
    // Resolve path
    let resolvedPath = installerPath;

    if (installerPath.startsWith("~")) {
        resolvedPath = path.join(os.homedir(), installerPath.slice(1));
    } else if (!path.isAbsolute(installerPath)) {
        // Try home directory first (e.g., Downloads/app.exe)
        const homePath = path.join(os.homedir(), installerPath);
        if (fs.existsSync(homePath)) {
            resolvedPath = homePath;
        } else {
            // Try current working directory
            resolvedPath = path.resolve(installerPath);
        }
    }

    resolvedPath = path.normalize(resolvedPath);

    // Validate file
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: ${installerPath}`);
    }

    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${resolvedPath}`);
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    if (ext !== ".exe" && ext !== ".msi") {
        throw new Error("Invalid file type. Only .exe and .msi files are supported.");
    }

    const fileSizeMB = stats.size / (1024 * 1024);
    if (fileSizeMB > 100) {
        throw new Error(`File size exceeds 100MB limit. File size: ${fileSizeMB.toFixed(2)}MB`);
    }

    console.log(`\nUploading installer: ${path.basename(resolvedPath)} (${fileSizeMB.toFixed(2)}MB)...\n`);

    // Upload installer
    const form = new FormData();
    form.append("installer", fs.createReadStream(resolvedPath));

    const url = new URL(`${apiUrl}/upload-installer`);
    const client = url.protocol === "https:" ? https : http;

    const response = await new Promise<{ statusCode: number; data: string }>((resolve, reject) => {
        const req = client.request(
            {
                method: "POST",
                hostname: url.hostname,
                port: url.port || (url.protocol === "https:" ? 443 : 80),
                path: url.pathname,
                headers: form.getHeaders(),
            },
            (res) => {
                let data = "";
                res.on("data", (chunk) => data += chunk);
                res.on("end", () => resolve({ statusCode: res.statusCode || 200, data }));
            }
        );

        req.on("error", reject);
        form.pipe(req);
    });

    if (response.statusCode !== 200) {
        throw new Error(`Upload failed: ${response.data}`);
    }

    const result = JSON.parse(response.data);
    console.log("✓ Installer uploaded successfully!");
    console.log(`  Filename: ${result.filename}`);
    console.log(`  Temp path: ${result.temp_path}\n`);

    // Launch installer via FreeRDP
    console.log("Launching installer via FreeRDP...\n");
    await launchInstallerViaFreeRDP(result.temp_path, result.filename, rdpPort);
}

async function launchInstallerViaFreeRDP(installerPath: string, installerName: string, rdpPort: number): Promise<void> {
    // Get credentials
    const composePath = path.join(os.homedir(), ".winboat", "docker-compose.yml");
    if (!fs.existsSync(composePath)) {
        throw new Error("WinBoat compose file not found");
    }

    const compose = YAML.parse(fs.readFileSync(composePath, "utf-8"));
    const username = compose.services?.windows?.environment?.USERNAME;
    const password = compose.services?.windows?.environment?.PASSWORD;

    if (!username || !password) {
        throw new Error("Could not read credentials from compose file");
    }

    // Find FreeRDP
    const freeRDP = await findFreeRDP();
    if (!freeRDP) {
        throw new Error("FreeRDP 3.x not found. Please install FreeRDP 3.x.");
    }

    // Build FreeRDP command
    const cleanName = installerName.replace(/[,.'\"]/g, "").replace(/\.[^.]*$/, "");
    const isMSI = installerPath.toLowerCase().endsWith(".msi");

    const appProgram = isMSI ? "C:\\\\Windows\\\\System32\\\\msiexec.exe" : installerPath;
    const appCmd = isMSI ? `/i "${installerPath}"` : "";

    const rdpArgs = [
        `/u:${username}`,
        `/p:${password}`,
        `/v:127.0.0.1`,
        `/port:${rdpPort}`,
        "/cert:ignore",
        "+clipboard",
        "/sound:sys:pulse",
        "/microphone:sys:pulse",
        "/floatbar",
        "/compression",
        "/sec:tls",
        "/gfx:RFX",
        "/rfx",
        "+auto-reconnect",
        "-wallpaper",
        "/scale-desktop:100",
        `/wm-class:winboat-installer-${cleanName}`,
        `/app:program:${appProgram},name:${cleanName} Installer,cmd:"${appCmd}"`,
    ];

    const commandArgs = [...freeRDP.args, ...rdpArgs];

    // Launch FreeRDP for installer
    const child = spawn(freeRDP.command, commandArgs, {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
    });

    // Immediately unref to allow CLI to exit
    child.unref();

    let errorOutput = "";
    child.stderr?.on("data", (data: Buffer) => {
        errorOutput += data.toString();
    });

    child.on("error", (error: any) => {
        console.error(`\nFreeRDP spawn error: ${error.message}`);
    });

    child.on("exit", (code: number | null) => {
        // Only log if it's an actual error (not normal exit codes)
        if (code !== null && code !== 0 && code !== 1 && code !== 131 && code !== 147) {
            console.error(`\nFreeRDP exited with code ${code}`);
            if (errorOutput) {
                const errorLines = errorOutput.split('\n').filter((line: string) =>
                    line.includes('ERROR') || line.includes('error')
                ).slice(0, 3);
                if (errorLines.length > 0) {
                    console.error(`Errors: ${errorLines.join(', ')}`);
                }
            }
        }
    });

    // Brief delay to catch immediate failures
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log("✓ Installer window should appear shortly on your host!");
}

// ============================================================================
// Launch Function
// ============================================================================

async function launchApp(apiUrl: string, appName: string, rdpPort: number): Promise<void> {
    console.log(`\nSearching for app: "${appName}"...\n`);

    const apps = await getApps(apiUrl);
    const matchingApps = apps.filter(app =>
        app.Name.toLowerCase().includes(appName.toLowerCase())
    );

    if (matchingApps.length === 0) {
        console.error(`Error: No app found matching "${appName}"`);
        console.log("\nUse 'winboat --list' to see all available applications.");
        process.exit(1);
    }

    if (matchingApps.length > 1) {
        console.log(`Found ${matchingApps.length} matching apps:`);
        matchingApps.forEach((app, index) => {
            console.log(`  ${index + 1}. ${app.Name} (${app.Source})`);
        });
        console.log("\nPlease be more specific with the app name.");
        process.exit(1);
    }

    const app = matchingApps[0];
    console.log(`Launching: ${app.Name}...`);

    // Get credentials
    const composePath = path.join(os.homedir(), ".winboat", "docker-compose.yml");
    const compose = YAML.parse(fs.readFileSync(composePath, "utf-8"));
    const username = compose.services?.windows?.environment?.USERNAME;
    const password = compose.services?.windows?.environment?.PASSWORD;

    if (!username || !password) {
        throw new Error("Could not read credentials from compose file");
    }

    // Check if RDP session exists (seamless launch)
    try {
        const statusRes = await makeRequest(`${apiUrl}/rdp/status`);
        if (statusRes.statusCode === 200) {
            const status = JSON.parse(statusRes.data);

            if (status.rdpConnected) {
                console.log("  ✓ Existing RDP session detected. Launching seamlessly via API...\n");

                const launchForm = new FormData();
                launchForm.append("username", username);
                launchForm.append("password", password);
                launchForm.append("path", app.Path);
                launchForm.append("args", app.Args || "");

                try {
                    const url = new URL(`${apiUrl}/launch`);
                    const client = url.protocol === "https:" ? https : http;

                    await new Promise((resolve, reject) => {
                        const req = client.request(
                            {
                                method: "POST",
                                hostname: url.hostname,
                                port: url.port || (url.protocol === "https:" ? 443 : 80),
                                path: url.pathname,
                                headers: launchForm.getHeaders(),
                            },
                            (res) => {
                                let data = "";
                                res.on("data", (chunk) => data += chunk);
                                res.on("end", () => {
                                    if (res.statusCode === 200) {
                                        resolve(data);
                                    } else {
                                        reject(new Error(`API returned status ${res.statusCode}: ${data}`));
                                    }
                                });
                            }
                        );
                        req.on("error", reject);
                        launchForm.pipe(req);
                    });

                    console.log("✓ App launched successfully in existing session!");
                    return;
                } catch (apiErr: any) {
                    console.error(`  ✗ API launch failed: ${apiErr.message}`);
                    console.log("  Falling back to new RDP connection...\n");
                }
            }
        }
    } catch { }

    // Fallback: Launch via new FreeRDP session
    console.log("  ℹ Starting new RDP connection...\n");

    const freeRDP = await findFreeRDP();
    if (!freeRDP) {
        throw new Error("FreeRDP 3.x not found. Please install FreeRDP 3.x.");
    }

    const cleanAppName = app.Name.replace(/[,.'\"]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "-");

    const rdpArgs = [
        `/u:${username}`,
        `/p:${password}`,
        `/v:127.0.0.1`,
        `/port:${rdpPort}`,
        "/cert:ignore",
        "+clipboard",
        "/sound:sys:pulse",
        "/microphone:sys:pulse",
        "/floatbar",
        "/compression",
        "/sec:tls",
        "/network:auto",
        "+auto-reconnect",
        "-wallpaper",
        "/scale-desktop:100",
        `/wm-class:winboat-${cleanAppName}`,
        `/app:program:${app.Path},name:${cleanAppName},cmd:"${app.Args || ""}"`,
    ];

    const commandArgs = [...freeRDP.args, ...rdpArgs];

    const child = spawn(freeRDP.command, commandArgs, {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"], // Capture both stdout and stderr
        env: process.env,
    });

    // Immediately unref so the CLI can exit without waiting for FreeRDP
    child.unref();

    let errorOutput = "";
    let stdoutOutput = "";

    // Capture stderr
    child.stderr?.on("data", (data: Buffer) => {
        errorOutput += data.toString();
    });

    // Capture stdout (FreeRDP may output here)
    child.stdout?.on("data", (data: Buffer) => {
        stdoutOutput += data.toString();
    });

    child.on("error", (error: any) => {
        console.error(`\nFreeRDP spawn error: ${error.message}`);
        console.error(`Make sure FreeRDP is installed: xfreerdp3 --version`);
        process.exit(1);
    });

    let processExited = false;
    child.on("exit", (code: number | null, signal: string | null) => {
        processExited = true;

        // FreeRDP exit codes (common ones):
        // 0 = Success
        // 1 = RPC_INITIATED_DISCONNECT (session already exists, normal)
        // 131 = Connection closed by user
        // 147 = ERRINFO_LOGOFF_BY_USER (normal disconnect)

        if (code !== null && code !== 0 && code !== 1 && code !== 131 && code !== 147) {
            console.error(`\nFreeRDP exited unexpectedly with code ${code}${signal ? ` (signal: ${signal})` : ""}`);

            if (errorOutput) {
                // Only show relevant error info
                const errorLines = errorOutput.split('\n').filter((line: string) =>
                    line.includes('ERROR') || line.includes('error') || line.includes('failed')
                ).slice(0, 5);

                if (errorLines.length > 0) {
                    console.error(`\nErrors:`);
                    errorLines.forEach((line: string) => console.error(`  ${line.trim()}`));
                }
            }
        }
    });

    // Wait a bit to catch immediate failures
    await new Promise(resolve => setTimeout(resolve, 500));

    if (!processExited) {
        console.log("\n✓ App launched successfully!");
    } else {
        // Process exited quickly - might be an error
        if (errorOutput && child.exitCode !== 0 && child.exitCode !== 1) {
            console.error("\nFreeRDP exited immediately. Check the errors above.");
        }
    }
}

// ============================================================================
// Status Function
// ============================================================================

async function showStatus(container: ContainerInfo, ports: PortInfo, apiUrl?: string): Promise<void> {
    console.log("\n" + "=".repeat(50));
    console.log("WinBoat Status");
    console.log("=".repeat(50) + "\n");

    // Container status
    console.log("Container Status:");
    if (!container.exists) {
        console.log("  ✗ No WinBoat container found");
        console.log("\n  Please install WinBoat using the GUI application.");
        return;
    }

    console.log(`  ✓ Container found: ${container.name}`);
    console.log(`  Runtime: ${container.runtime}`);
    console.log(`  Status: ${container.running ? "Running" : "Stopped"}`);

    if (!container.running) {
        console.log("\n  To start the container:");
        console.log(`    ${container.runtime} start ${container.name}`);
        return;
    }

    // Guest server status
    console.log("\nGuest Server:");
    const guestRunning = await checkGuestServerRunning(container);
    if (guestRunning) {
        console.log("  ✓ WinBoat Guest Server is running");
    } else {
        console.log("  ✗ WinBoat Guest Server is not running");
        console.log("  (Container may still be booting, please wait...)");
    }

    // Port mappings
    console.log("\nPort Mappings:");
    if (ports.api) {
        console.log(`  ✓ API Port: ${ports.api} → 7148`);
    } else {
        console.log("  ✗ API Port: Not detected");
    }

    if (ports.rdp) {
        console.log(`  ✓ RDP Port: ${ports.rdp} → 3389`);
    } else {
        console.log("  ✗ RDP Port: Not detected");
    }

    // API health
    if (apiUrl) {
        console.log("\nAPI Health:");
        const portOpen = await testPortConnectivity(ports.api!, true);

        if (portOpen) {
            const healthy = await checkApiHealth(apiUrl, true);
            if (!healthy) {
                console.log("  ⚠ Port is open but API is not responding");
                console.log("  (Guest may still be booting...)");
            }
        }
    }

    console.log("\n" + "=".repeat(50) + "\n");
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
    try {
        const options = parseArgs();

        // Detect container
        const container = await detectContainer();

        // Discover ports
        const ports = await discoverPorts(container);

        // Determine API URL
        let apiUrl = options.apiUrl;
        if (!apiUrl && ports.api) {
            apiUrl = `http://localhost:${ports.api}`;
            console.log(`Auto-detected API URL: ${apiUrl}\n`);
        } else if (!apiUrl) {
            apiUrl = "http://localhost:7148"; // Default
        }

        // Remove trailing slash
        apiUrl = apiUrl.replace(/\/$/, "");

        // Execute command
        if (options.status) {
            await showStatus(container, ports, apiUrl);
        } else if (options.list) {
            if (!container.running) {
                console.error("Error: WinBoat container is not running");
                process.exit(1);
            }

            const healthy = await checkApiHealth(apiUrl);
            if (!healthy) {
                console.error("Error: WinBoat API is not accessible");
                process.exit(1);
            }

            await listApps(apiUrl);
        } else if (options.install) {
            if (!container.running) {
                console.error("Error: WinBoat container is not running");
                console.error(`Start it with: ${container.runtime} start ${container.name}`);
                process.exit(1);
            }

            if (!ports.rdp) {
                console.error("Error: Could not detect RDP port");
                process.exit(1);
            }

            const healthy = await checkApiHealth(apiUrl);
            if (!healthy) {
                console.error("Error: WinBoat API is not accessible");
                process.exit(1);
            }

            await installApp(apiUrl, options.install, ports.rdp);
        } else if (options.launch) {
            if (!container.running) {
                console.error("Error: WinBoat container is not running");
                console.error(`Start it with: ${container.runtime} start ${container.name}`);
                process.exit(1);
            }

            if (!ports.rdp) {
                console.error("Error: Could not detect RDP port");
                process.exit(1);
            }

            const healthy = await checkApiHealth(apiUrl);
            if (!healthy) {
                console.error("Error: WinBoat API is not accessible");
                process.exit(1);
            }

            await launchApp(apiUrl, options.launch, ports.rdp);
        } else {
            console.error("Error: No action specified");
            console.error("Use -h or --help for usage information");
            process.exit(1);
        }
    } catch (error: any) {
        console.error(`\nError: ${error.message}`);
        process.exit(1);
    }
}

// ============================================================================
// Entry Point
// ============================================================================

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
