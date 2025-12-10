#!/usr/bin/env node
/**
 * WinBoat CLI - Command Line Interface
 * 
 * Usage:
 *   winboat -i <path-to-installer>     Install an application
 *   winboat -l <app-name>               Launch an application
 *   winboat --list                      List all available applications
 *   winboat --status                    Check WinBoat status
 *   winboat --api-url <url>             Specify custom API URL (default: http://localhost:7148)
 * 
 * Examples:
 *   winboat -i ~/Downloads/app.msi
 *   winboat -l "Google Chrome"
 *   winboat --list
 *   winboat --status
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

interface CliOptions {
    install?: string;
    launch?: string;
    list?: boolean;
    status?: boolean;
    apiUrl: string;
}

interface WinApp {
    Name: string;
    Path: string;
    Args: string;
    Icon: string;
    Source: string;
    Usage?: number;
}

function parseArgs(): CliOptions {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        showHelp();
        process.exit(0);
    }

    const options: CliOptions = {
        apiUrl: "http://localhost:7148",
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === "-i" || arg === "--install") {
            if (i + 1 >= args.length) {
                console.error("Error: -i/--install requires a file path");
                process.exit(1);
            }
            options.install = args[++i];
        } else if (arg === "-l" || arg === "--launch") {
            if (i + 1 >= args.length) {
                console.error("Error: -l/--launch requires an app name");
                process.exit(1);
            }
            options.launch = args[++i];
        } else if (arg === "--list" || arg === "-ls" || arg === "-list") {
            options.list = true;
        } else if (arg === "--status" || arg === "-s" || arg === "-status") {
            options.status = true;

        } else if (arg === "--api-url") {
            if (i + 1 >= args.length) {
                console.error("Error: --api-url requires a URL");
                process.exit(1);
            }
            options.apiUrl = args[++i];
        } else if (arg === "-h" || arg === "--help") {
            showHelp();
            process.exit(0);
        } else {
            console.error(`Error: Unknown option: ${arg}`);
            console.error("Use -h or --help for usage information");
            process.exit(1);
        }
    }

    // Normalize API URL
    if (options.apiUrl.endsWith("/")) {
        options.apiUrl = options.apiUrl.slice(0, -1);
    }

    return options;
}

function showHelp() {
    console.log(`
WinBoat CLI - Command Line Interface

Usage:
  winboat [options]

Options:
  -i, --install <path>     Install an application from installer file (.exe or .msi)
  -l, --launch <name>       Launch an application by name
  --list, -ls, -list        List all available applications
  --status, -s, -status     Check WinBoat container and API status
  --api-url <url>           Specify custom API URL (default: http://localhost:7148)
  -h, --help                Show this help message

Examples:
  winboat -i ~/Downloads/app.msi
  winboat -l "Google Chrome"
  winboat --list
  winboat --status
  winboat --api-url http://localhost:7148 --list
`);
}

function makeRequest(url: string, method: string = "GET", body?: any): Promise<{ statusCode: number; data: string }> {
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
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                resolve({ statusCode: res.statusCode || 200, data });
            });
        });

        req.on("error", (err) => {
            reject(err);
        });

        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error("Request timeout"));
        });

        if (body) {
            if (body.pipe) {
                body.pipe(req);
            } else {
                req.write(body);
                req.end();
            }
        } else {
            req.end();
        }
    });
}

async function checkContainerStatus(): Promise<{ running: boolean; exists: boolean; name?: string }> {
    const execAsync = promisify(exec);

    // Check Docker
    try {
        const { stdout } = await execAsync("docker ps -a --filter name=WinBoat --format '{{.Names}}|{{.Status}}'");
        if (stdout.trim()) {
            const [name, status] = stdout.trim().split("|");
            return {
                running: status.includes("Up"),
                exists: true,
                name: name || "WinBoat",
            };
        }
    } catch { }

    // Check Podman
    try {
        const { stdout } = await execAsync("podman ps -a --filter name=WinBoat --format '{{.Names}}|{{.Status}}'");
        if (stdout.trim()) {
            const [name, status] = stdout.trim().split("|");
            return {
                running: status.includes("Up"),
                exists: true,
                name: name || "WinBoat",
            };
        }
    } catch { }

    return { running: false, exists: false };
}

async function checkGuestServerRunning(containerName: string = "WinBoat"): Promise<boolean> {
    const execAsync = promisify(exec);

    // Try Docker
    try {
        // Check if process is running (Windows tasklist)
        const { stdout } = await execAsync(`docker exec ${containerName} tasklist /FI "IMAGENAME eq winboat_guest_server.exe" 2>/dev/null || true`);
        if (stdout.includes("winboat_guest_server.exe")) {
            return true;
        }

        // Try PowerShell
        const { stdout: psOutput } = await execAsync(`docker exec ${containerName} powershell -Command "Get-Process | Where-Object {$_.ProcessName -like '*winboat*'}" 2>/dev/null || true`);
        if (psOutput && psOutput.trim() && !psOutput.includes("Cannot find")) {
            return true;
        }
    } catch { }

    // Try Podman
    try {
        const { stdout } = await execAsync(`podman exec ${containerName} tasklist /FI "IMAGENAME eq winboat_guest_server.exe" 2>/dev/null || true`);
        if (stdout.includes("winboat_guest_server.exe")) {
            return true;
        }
    } catch { }

    return false;
}

async function getApiPortFromCompose(): Promise<number | null> {
    try {
        const compose = await getComposeFile();
        const ports = compose.services?.windows?.ports || [];

        for (const portEntry of ports) {
            if (typeof portEntry === "string") {
                // Format: "127.0.0.1:47280-47289:7148/tcp" or "127.0.0.1:47280:7148/tcp"
                if (portEntry.includes(":7148") || portEntry.includes("->7148")) {
                    // Parse the host port (use first port in range if it's a range)
                    // Pattern: IP:HOST_PORT_START-HOST_PORT_END:7148 or IP:HOST_PORT:7148
                    const match1 = portEntry.match(/(\d+\.\d+\.\d+\.\d+):(\d+)(?:-(\d+))?[:-]7148/);
                    if (match1) {
                        // Return the first port in the range
                        return parseInt(match1[2]);
                    }
                    // Pattern: :HOST_PORT:7148 (no IP)
                    const match2 = portEntry.match(/:(\d+)(?:-(\d+))?[:-]7148/);
                    if (match2) {
                        return parseInt(match2[1]);
                    }
                    // Pattern: HOST_PORT:7148 (short form)
                    const match3 = portEntry.match(/(\d+)(?:-(\d+))?:7148/);
                    if (match3) {
                        return parseInt(match3[1]);
                    }
                }
            } else if (typeof portEntry === "object" && portEntry.target === 7148) {
                // Long format: { target: 7148, published: "47280", ... }
                if (portEntry.published) {
                    const published = portEntry.published.toString();
                    // Handle port ranges like "47280-47289" - use first port
                    const portNum = published.split("-")[0];
                    return parseInt(portNum);
                }
            }
        }
    } catch (error) {
        // Silently fail, will try other methods
    }

    return null;
}

async function getApiPort(): Promise<number | null> {
    const execAsync = promisify(exec);

    // First, try to get the ACTUAL port from Docker/Podman (most accurate)
    // This is better than reading the compose file because Docker may assign
    // a different port from the range (e.g., 47286 instead of 47280)
    try {
        const { stdout } = await execAsync("docker port WinBoat 2>/dev/null || true");
        if (stdout.trim()) {
            // Format examples:
            // 7148/tcp -> 127.0.0.1:47286
            // 7148/tcp -> 0.0.0.0:47286
            const lines = stdout.trim().split('\n');
            for (const line of lines) {
                if (line.includes('7148')) {
                    // Match pattern: 7148/tcp -> IP:PORT or 7148/tcp -> PORT
                    const match1 = line.match(/7148\/tcp\s*->\s*(?:\d+\.\d+\.\d+\.\d+:)?(\d+)/);
                    if (match1) {
                        return parseInt(match1[1]);
                    }
                    // Also try reverse format: IP:PORT->7148
                    const match2 = line.match(/(\d+\.\d+\.\d+\.\d+):(\d+)->7148/);
                    if (match2) {
                        return parseInt(match2[2]);
                    }
                    // Or: :PORT->7148
                    const match3 = line.match(/:(\d+)->7148/);
                    if (match3) {
                        return parseInt(match3[1]);
                    }
                }
            }
        }
    } catch { }

    // Try Podman port command
    try {
        const { stdout } = await execAsync("podman port WinBoat 2>/dev/null || true");
        if (stdout.trim()) {
            const lines = stdout.trim().split('\n');
            for (const line of lines) {
                if (line.includes('7148')) {
                    const match1 = line.match(/7148\/tcp\s*->\s*(?:\d+\.\d+\.\d+\.\d+:)?(\d+)/);
                    if (match1) {
                        return parseInt(match1[1]);
                    }
                    const match2 = line.match(/(\d+\.\d+\.\d+\.\d+):(\d+)->7148/);
                    if (match2) {
                        return parseInt(match2[2]);
                    }
                    const match3 = line.match(/:(\d+)->7148/);
                    if (match3) {
                        return parseInt(match3[1]);
                    }
                }
            }
        }
    } catch { }

    // Fallback: try to get from compose file (less accurate for port ranges)
    const composePort = await getApiPortFromCompose();
    if (composePort) {
        return composePort;
    }

    // Try docker ps format - more complex parsing
    try {
        const { stdout } = await execAsync("docker ps --filter name=WinBoat --format '{{.Ports}}' 2>/dev/null || true");
        if (stdout.trim()) {
            // Format: 0.0.0.0:47280-47289->8006/tcp, 127.0.0.1:47280-47289->7148/tcp, ...
            const portsStr = stdout.trim();

            // Try to find port mapping to 7148
            const patterns = [
                /(\d+\.\d+\.\d+\.\d+):(\d+)->7148/,  // 127.0.0.1:47280->7148
                /:(\d+)->7148/,                        // :47280->7148
            ];

            for (const pattern of patterns) {
                const match = portsStr.match(pattern);
                if (match) {
                    const port = match[2] || match[1];
                    if (port) {
                        return parseInt(port);
                    }
                }
            }
        }
    } catch { }

    // Try podman ps format
    try {
        const { stdout } = await execAsync("podman ps --filter name=WinBoat --format '{{.Ports}}' 2>/dev/null || true");
        if (stdout.trim()) {
            const portsStr = stdout.trim();
            const match = portsStr.match(/:(\d+)->7148/);
            if (match) {
                return parseInt(match[1]);
            }
        }
    } catch { }

    return null;
}

async function testPortConnectivity(host: string, port: number, verbose: boolean = false): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();

        socket.setTimeout(3000);
        socket.once("connect", () => {
            socket.destroy();
            if (verbose) {
                console.log(`  ✓ Port ${port} is accepting connections`);
            }
            resolve(true);
        });
        socket.once("timeout", () => {
            socket.destroy();
            if (verbose) {
                console.log(`  ✗ Port ${port} connection timeout`);
            }
            resolve(false);
        });
        socket.once("error", (err: any) => {
            if (verbose) {
                console.log(`  ✗ Port ${port} connection error: ${err.code || err.message}`);
            }
            resolve(false);
        });

        socket.connect(port, host);
    });
}

async function checkApiHealth(apiUrl: string, verbose: boolean = false): Promise<boolean> {
    try {
        // First test if port is open
        const urlObj = new URL(apiUrl);
        const host = urlObj.hostname;
        const port = parseInt(urlObj.port || (urlObj.protocol === "https:" ? "443" : "80"));

        if (verbose) {
            console.log(`  Testing port connectivity to ${host}:${port}...`);
            const portOpen = await testPortConnectivity(host, port, verbose);
            if (!portOpen) {
                console.log(`  ✗ Port ${port} is not accepting connections`);
                console.log(`  This could mean:`);
                console.log(`    - The port mapping is incorrect`);
                console.log(`    - The guest server is not listening on 0.0.0.0 inside the container`);
                console.log(`    - A firewall is blocking the connection`);
                return false;
            }
        }

        const response = await makeRequest(`${apiUrl}/health`);
        if (verbose && response.statusCode !== 200) {
            console.log(`  ✗ API health check returned status ${response.statusCode}`);
            console.log(`  Response: ${response.data.substring(0, 100)}`);
        }
        if (verbose && response.statusCode === 200) {
            console.log(`  ✓ API is responding correctly`);
        }
        return response.statusCode === 200;
    } catch (error: any) {
        if (verbose) {
            console.log(`  ✗ API health check failed: ${error.message}`);
            if (error.message.includes("ECONNREFUSED")) {
                console.log(`  Connection refused - the service is not listening on this port`);
            } else if (error.message.includes("ETIMEDOUT")) {
                console.log(`  Connection timeout - the port might be blocked by firewall`);
            }
        }
        return false;
    }
}

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

async function launchInstallerViaRDP(installerPath: string, installerName: string): Promise<void> {
    try {
        // Get credentials and RDP port
        const compose = await getComposeFile();
        const username = compose.services?.windows?.environment?.USERNAME;
        const password = compose.services?.windows?.environment?.PASSWORD;

        if (!username || !password) {
            throw new Error("Could not read credentials from compose file");
        }

        const rdpPort = await getRDPPort();

        // Find FreeRDP
        const freeRDP = await findFreeRDP();
        if (!freeRDP) {
            throw new Error("FreeRDP 3.x not found. Please install FreeRDP 3.x with sound support.");
        }

        // Build FreeRDP command for installer
        const cleanName = installerName.replace(/[,.'"]/g, "").replace(/\.[^.]*$/, ""); // Remove extension
        const stockArgs = [
            "/cert:ignore",
            "+clipboard",
            "/sound:sys:pulse",
            "/microphone:sys:pulse",
            "/floatbar",
            "/compression",
            "/sec:tls",
            "/gfx:RFX", // Enable RemoteFX graphics for better UI interaction (helps with clickable notifications)
            "/rfx", // RemoteFX codec for better interactive content
            "+auto-reconnect", // Auto-reconnect for better stability
        ];

        // Determine command based on file extension
        const isMSI = installerPath.toLowerCase().endsWith(".msi");

        // For MSI: use msiexec.exe with /i argument
        // For EXE: run the installer directly
        const appProgram = isMSI ? "C:\\Windows\\System32\\msiexec.exe" : installerPath;
        const appCmd = isMSI ? `/i "${installerPath}"` : "";

        const rdpArgs = [
            `/u:${username}`,
            `/p:${password}`,
            `/v:127.0.0.1`,
            `/port:${rdpPort}`,
            ...stockArgs,
            "-wallpaper",
            `/scale-desktop:100`,
            `/wm-class:winboat-installer-${cleanName}`,
            `/app:program:${appProgram},name:${cleanName} Installer,cmd:"${appCmd}"`,
        ];

        const commandArgs = [
            ...(freeRDP.args.length > 0 ? freeRDP.args : []),
            ...rdpArgs,
        ];

        // Escape arguments properly for shell execution
        const escapedArgs = commandArgs.map(arg => {
            if (arg.includes(" ") || arg.includes("(") || arg.includes(")")) {
                return `"${arg.replace(/"/g, '\\"')}"`;
            }
            return arg;
        });

        // Build full command string with nohup and backgrounding
        const fullCommand = `nohup ${freeRDP.command} ${escapedArgs.join(" ")} > /dev/null 2>&1 &`;

        // Use exec to run the shell command
        const child = exec(
            fullCommand,
            {
                env: process.env,
            },
            (error: any) => {
                if (error && error.code !== 1 && error.code !== 147) {
                    console.error(`\nFreeRDP error: ${error.message}`);
                }
            }
        );

        child.unref(); // Unref to allow Node.js to exit

        await new Promise(resolve => setTimeout(resolve, 300)); // Brief delay

        console.log("✓ Installer window should appear shortly on your host!");

    } catch (error: any) {
        console.error(`\nError launching installer: ${error.message}`);
        throw error;
    }
}

async function installApp(apiUrl: string, installerPath: string): Promise<void> {
    // Resolve relative paths - if path doesn't start with / or ~, resolve from home directory
    // or current working directory (whichever makes sense)
    let resolvedPath = installerPath;
    if (!path.isAbsolute(installerPath) && !installerPath.startsWith("~")) {
        // Try resolving from home directory first (common case: Downloads/file.exe)
        const homePath = path.join(os.homedir(), installerPath);
        if (fs.existsSync(homePath)) {
            resolvedPath = homePath;
        } else {
            // Try resolving from current working directory
            resolvedPath = path.resolve(installerPath);
        }
    } else if (installerPath.startsWith("~")) {
        // Expand ~ to home directory
        resolvedPath = path.join(os.homedir(), installerPath.slice(1));
    }

    // Normalize the path
    resolvedPath = path.normalize(resolvedPath);

    // Validate file
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: ${installerPath} (resolved to: ${resolvedPath})`);
    }

    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${resolvedPath}`);
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    if (ext !== ".exe" && ext !== ".msi") {
        throw new Error(`Invalid file type. Only .exe and .msi files are supported.`);
    }

    const fileSizeMB = stats.size / (1024 * 1024);
    if (fileSizeMB > 100) {
        throw new Error(`File size exceeds 100MB limit. File size: ${fileSizeMB.toFixed(2)}MB`);
    }

    console.log(`Uploading installer: ${path.basename(resolvedPath)}...`);

    const form = new FormData();
    form.append("installer", fs.createReadStream(resolvedPath));

    try {
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
                    res.on("data", (chunk) => {
                        data += chunk;
                    });
                    res.on("end", () => {
                        resolve({ statusCode: res.statusCode || 200, data });
                    });
                }
            );

            req.on("error", reject);
            form.pipe(req);
        });

        if (response.statusCode === 200) {
            const result = JSON.parse(response.data);
            console.log("✓ Installer uploaded successfully!");
            console.log(`  Filename: ${result.filename}`);
            console.log(`  Temp path: ${result.temp_path}`);

            // Launch installer via FreeRDP so it appears as native window on host
            console.log("\nLaunching installer via FreeRDP...");
            await launchInstallerViaRDP(result.temp_path, result.filename);
        } else {
            throw new Error(`API returned status ${response.statusCode}: ${response.data}`);
        }
    } catch (error: any) {
        throw new Error(`Installation failed: ${error.message}`);
    }
}

async function getComposeFile(): Promise<any> {
    const composePath = path.join(os.homedir(), ".winboat", "docker-compose.yml");

    if (!fs.existsSync(composePath)) {
        throw new Error("WinBoat compose file not found. Please ensure WinBoat is set up.");
    }

    const composeContent = fs.readFileSync(composePath, "utf-8");
    return YAML.parse(composeContent);
}

async function getRDPPort(): Promise<number> {
    const execAsync = promisify(exec);

    // First, try to get the ACTUAL port from Docker/Podman (most accurate)
    // This is better than reading the compose file because Docker may assign
    // a different port from the range (e.g., 47306 instead of 47300)
    try {
        const { stdout } = await execAsync("docker port WinBoat 2>/dev/null || true");
        if (stdout.trim()) {
            // Format: 3389/tcp -> 127.0.0.1:47306
            const lines = stdout.trim().split('\n');
            for (const line of lines) {
                if (line.includes('3389/tcp')) {
                    // Match pattern: 3389/tcp -> IP:PORT
                    const match = line.match(/3389\/tcp\s*->\s*(?:\d+\.\d+\.\d+\.\d+:)?(\d+)/);
                    if (match) {
                        return parseInt(match[1]);
                    }
                }
            }
        }
    } catch { }

    // Try Podman port command
    try {
        const { stdout } = await execAsync("podman port WinBoat 2>/dev/null || true");
        if (stdout.trim()) {
            const lines = stdout.trim().split('\n');
            for (const line of lines) {
                if (line.includes('3389/tcp')) {
                    const match = line.match(/3389\/tcp\s*->\s*(?:\d+\.\d+\.\d+\.\d+:)?(\d+)/);
                    if (match) {
                        return parseInt(match[1]);
                    }
                }
            }
        }
    } catch { }

    // Fallback: try docker ps format
    try {
        const { stdout } = await execAsync("docker ps --filter name=WinBoat --format '{{.Ports}}' 2>/dev/null || true");
        if (stdout.trim()) {
            const portsStr = stdout.trim();
            // Try to find port mapping to 3389
            const match = portsStr.match(/:(\d+)->3389\/tcp/);
            if (match) {
                return parseInt(match[1]);
            }
        }
    } catch { }

    // Last resort: check compose file (less accurate for port ranges)
    try {
        const compose = await getComposeFile();
        const ports = compose.services?.windows?.ports || [];
        for (const port of ports) {
            if (typeof port === "string" && port.includes(":3389")) {
                const match = port.match(/(\d+):3389/);
                if (match) {
                    // Return first port in range (not ideal, but better than nothing)
                    return parseInt(match[1]);
                }
            }
        }
    } catch { }

    throw new Error("Could not determine RDP port. Please ensure the container is running.");
}

async function findFreeRDP(): Promise<{ command: string; args: string[] } | null> {
    const execAsync = promisify(exec);

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

async function launchApp(apiUrl: string, appName: string): Promise<void> {
    console.log(`Searching for app: "${appName}"...`);

    const apps = await getApps(apiUrl);
    const matchingApps = apps.filter(
        (app) => app.Name.toLowerCase().includes(appName.toLowerCase())
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
    console.log(`Launching: ${app.Name}...\n`);

    try {
        // Get credentials and RDP port
        const compose = await getComposeFile();
        const username = compose.services?.windows?.environment?.USERNAME;
        const password = compose.services?.windows?.environment?.PASSWORD;

        if (!username || !password) {
            throw new Error("Could not read credentials from compose file");
        }

        // CHECK RDP STATUS - If session exists, launch via API to avoid session stealing
        try {
            const statusRes = await makeRequest(`${apiUrl}/rdp/status`);
            if (statusRes.statusCode === 200) {
                const status = JSON.parse(statusRes.data);
                if (status.rdpConnected) {
                    console.log("  ✓ Existing RDP session detected. Launching seamlessly via API...");
                    console.log(`  Target: ${app.Path} ${app.Args || ""}`);

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

                        console.log("\n✓ App launched successfully in existing session!");
                        return;
                    } catch (apiErr: any) {
                        console.error(`  ✗ API Launch failed: ${apiErr.message}`);
                        console.error(`  Debug: URL was ${apiUrl}/launch`);
                        console.log("  Falling back to new RDP connection...");
                    }
                } else {
                    console.log("  ℹ No active RDP session detected (API returned false). Starting new connection...");
                }
            } else {
                console.log(`  ℹ Status check failed with code ${statusRes.statusCode}. Starting new connection...`);
            }
        } catch (e) {
            // Ignore status check errors and proceed to standard launch
        }

        const rdpPort = await getRDPPort();
        console.log(`  RDP Port: ${rdpPort}`);
        console.log(`  Username: ${username}`);

        // Find FreeRDP
        const freeRDP = await findFreeRDP();
        if (!freeRDP) {
            throw new Error("FreeRDP 3.x not found. Please install FreeRDP 3.x with sound support.");
        }

        console.log(`  Using: ${freeRDP.command}\n`);

        // Build FreeRDP command
        const cleanAppName = app.Name.replace(/[,.'"]/g, "");
        const stockArgs = [
            "/cert:ignore",
            "+clipboard",
            "/sound:sys:pulse",
            "/microphone:sys:pulse",
            "/floatbar",
            "/compression",
            "/sec:tls",
            // "/gfx:RFX", // RemoteFX removed - might cause input issues
            // "/rfx", // RemoteFX removed
            "/network:auto", // Add network auto-detection for better latency
            "+auto-reconnect", // Auto-reconnect for better stability
            // "/kbd:layout:0x00000409", // Optional: Force US keyboard layout if needed
        ];

        const rdpArgs = [
            `/u:${username}`,
            `/p:${password}`,
            `/v:127.0.0.1`,
            `/port:${rdpPort}`,
            ...stockArgs,
            "-wallpaper",
            `/scale-desktop:100`,
            `/wm-class:winboat-${cleanAppName}`,
            `/app:program:${app.Path},name:${cleanAppName},cmd:"${app.Args || ""}"`,
        ];

        // Build command arguments array (avoid shell interpretation of special characters)
        // Match the main WinBoat app's approach: use execFile with defaultArgs + args
        const commandArgs = [
            ...(freeRDP.args.length > 0 ? freeRDP.args : []),
            ...rdpArgs,
        ];

        console.log("Executing FreeRDP...");
        console.log(`Command: ${freeRDP.command} ${rdpArgs.slice(0, 3).join(" ")} ... (password hidden)\n`);

        // Escape arguments properly for shell execution
        // This ensures paths with special characters work correctly
        const escapedArgs = commandArgs.map(arg => {
            // If arg contains spaces or special chars, quote it
            if (arg.includes(" ") || arg.includes("(") || arg.includes(")")) {
                return `"${arg.replace(/"/g, '\\"')}"`;
            }
            return arg;
        });

        // Use spawn with detached:true, but ensure process is fully started before unref
        // The key: DON'T unref immediately - wait for process to establish itself
        const child = spawn(freeRDP.command, commandArgs, {
            detached: true,
            stdio: ["ignore", "ignore", "pipe"], // Capture stderr to see errors
            env: process.env,
        });

        let errorOutput = "";
        child.stderr?.on("data", (data: Buffer) => {
            errorOutput += data.toString();
        });

        // Handle spawn errors
        child.on("error", (error: any) => {
            console.error(`\nFreeRDP spawn error: ${error.message}`);
            console.error(`Make sure FreeRDP is installed: xfreerdp3 --version`);
            process.exit(1);
        });

        // Monitor exit to catch immediate failures
        let exited = false;
        child.on("exit", (code: number | null, signal: string | null) => {
            exited = true;
            if (code !== null && code !== 0 && code !== 1 && code !== 147) {
                console.error(`\nFreeRDP exited with code ${code}${signal ? ` (signal: ${signal})` : ""}`);
                if (errorOutput) {
                    console.error(`\nFreeRDP error output:\n${errorOutput.substring(0, 1000)}`);
                }
            }
        });

        // CRITICAL: Wait for process to start before unref
        // This ensures the process is fully detached and won't be killed
        await new Promise(resolve => setTimeout(resolve, 500));

        // Now unref - process should be safely detached
        if (!exited && !child.killed) {
            child.unref();
        }

        // Check if process died
        if (exited || child.killed) {
            console.error(`\nFreeRDP process failed to start.`);
            if (errorOutput) {
                console.error(`\nFreeRDP error output:\n${errorOutput.substring(0, 1000)}`);
            }
            console.error(`\nTry running manually:`);
            console.error(`${freeRDP.command} ${commandArgs.slice(0, 5).join(" ")} ...`);
            process.exit(1);
        }

        console.log("✓ App launch initiated!");
        console.log("The application window should appear shortly.");

    } catch (error: any) {
        console.error(`\nError launching app: ${error.message}`);
        console.log("\nTroubleshooting:");
        console.log("  1. Ensure the WinBoat container is running");
        console.log("  2. Ensure FreeRDP 3.x is installed");
        console.log("  3. Check that the RDP port is accessible");
        process.exit(1);
    }
}

async function listApps(apiUrl: string): Promise<void> {
    console.log("Fetching applications...\n");

    try {
        const apps = await getApps(apiUrl);

        if (apps.length === 0) {
            console.log("No applications found.");
            return;
        }

        // Group by source
        const bySource: { [key: string]: WinApp[] } = {};
        apps.forEach((app) => {
            if (!bySource[app.Source]) {
                bySource[app.Source] = [];
            }
            bySource[app.Source].push(app);
        });

        // Display
        const sourceNames: { [key: string]: string } = {
            system: "System Tools",
            winreg: "Windows Registry",
            startmenu: "Start Menu",
            uwp: "Microsoft Store",
            internal: "Internal",
            custom: "Custom Apps",
        };

        Object.keys(bySource)
            .sort()
            .forEach((source) => {
                const sourceApps = bySource[source];
                console.log(`${sourceNames[source] || source} (${sourceApps.length}):`);
                sourceApps
                    .sort((a, b) => a.Name.localeCompare(b.Name))
                    .forEach((app) => {
                        const usage = app.Usage ? ` (used ${app.Usage}x)` : "";
                        console.log(`  • ${app.Name}${usage}`);
                    });
                console.log();
            });

        console.log(`Total: ${apps.length} applications`);
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

async function showStatus(apiUrl: string): Promise<void> {
    console.log("WinBoat Status");
    console.log("==============\n");

    // Check container status first
    console.log("Checking container status...");
    const containerStatus = await checkContainerStatus();
    if (containerStatus.exists) {
        console.log(`✓ Container found: ${containerStatus.name || "WinBoat"}`);
        console.log(`  Status: ${containerStatus.running ? "Running" : "Stopped"}`);

        // Check if guest server is running
        if (containerStatus.running) {
            console.log("Checking guest server process...");
            const guestRunning = await checkGuestServerRunning(containerStatus.name);
            if (guestRunning) {
                console.log("  ✓ Guest server process is running\n");
            } else {
                console.log("  ✗ Guest server process not found\n");
                console.log("  The guest server may not be installed or started.");
                console.log("  Check container logs: docker logs WinBoat | grep -i guest\n");
            }
        } else {
            console.log();
        }
    } else {
        console.log("✗ No WinBoat container found\n");
    }

    // Check API health
    console.log("Checking API health...");

    // Try to detect the actual API port
    const detectedPort = await getApiPort();
    let testUrl = apiUrl;
    if (detectedPort && detectedPort !== 7148) {
        const urlObj = new URL(apiUrl);
        urlObj.port = detectedPort.toString();
        testUrl = urlObj.toString();
        // Remove trailing slash
        if (testUrl.endsWith('/')) {
            testUrl = testUrl.slice(0, -1);
        }
        console.log(`  Detected API port from compose file: ${detectedPort}`);
        console.log(`  Trying: ${testUrl}`);
    } else if (detectedPort === null) {
        console.log(`  Could not detect port mapping from compose file`);
        console.log(`  Trying default port: 7148`);
    } else {
        console.log(`  Using default port: 7148`);
    }

    // Ensure no trailing slash
    if (testUrl.endsWith('/')) {
        testUrl = testUrl.slice(0, -1);
    }

    const isHealthy = await checkApiHealth(testUrl, true);
    if (isHealthy) {
        // Update apiUrl if we found a different port
        if (detectedPort && detectedPort !== 7148) {
            apiUrl = testUrl;
            console.log(`  ✓ Using API at ${apiUrl}\n`);
        } else {
            console.log(`  ✓ API is accessible\n`);
        }
        console.log("✓ API is accessible\n");

        // Get version
        try {
            const response = await makeRequest(`${apiUrl}/version`);
            if (response.statusCode === 200) {
                const version = JSON.parse(response.data);
                console.log("Guest Server Version:");
                console.log(`  Version: ${version.version}`);
                console.log(`  Commit: ${version.commit_hash}`);
                console.log(`  Build: ${version.build_time}\n`);
            }
        } catch (error: any) {
            console.log("  (Could not fetch version info)\n");
        }

        // Get metrics
        try {
            const response = await makeRequest(`${apiUrl}/metrics`);
            if (response.statusCode === 200) {
                const metrics = JSON.parse(response.data);
                console.log("System Metrics:");
                console.log(`  CPU: ${metrics.cpu.usage.toFixed(1)}% @ ${metrics.cpu.frequency} MHz`);
                console.log(`  RAM: ${metrics.ram.used} MB / ${metrics.ram.total} MB (${metrics.ram.percentage.toFixed(1)}%)`);
                console.log(`  Disk: ${metrics.disk.used} MB / ${metrics.disk.total} MB (${metrics.disk.percentage.toFixed(1)}%)\n`);
            }
        } catch (error: any) {
            console.log("  (Could not fetch metrics)\n");
        }

        // Check RDP status
        try {
            const response = await makeRequest(`${apiUrl}/rdp/status`);
            if (response.statusCode === 200) {
                const status = JSON.parse(response.data);
                console.log(`RDP Connection: ${status.rdpConnected ? "✓ Connected" : "✗ Not connected"}\n`);
            }
        } catch (error: any) {
            console.log("  (Could not fetch RDP status)\n");
        }
    } else {
        console.log("✗ API is not accessible");

        // Try to find the actual port
        const detectedPort = await getApiPort();
        if (detectedPort && detectedPort !== 7148) {
            const urlObj = new URL(apiUrl);
            urlObj.port = detectedPort.toString();
            let altUrl = urlObj.toString();
            // Remove trailing slash
            if (altUrl.endsWith('/')) {
                altUrl = altUrl.slice(0, -1);
            }
            console.log(`\n  Detected API port: ${detectedPort}`);
            console.log(`  Try: winboat --api-url ${altUrl} --status`);

            // Try the detected port
            const altHealthy = await checkApiHealth(altUrl);
            if (altHealthy) {
                console.log(`  ✓ API is accessible at ${altUrl}\n`);
                apiUrl = altUrl;
            } else {
                console.log(`  ✗ API still not accessible at ${altUrl}\n`);
                console.log(`  This might indicate:`);
                console.log(`    - The guest server is not listening on port 7148 inside the container`);
                console.log(`    - Firewall or network configuration issue`);
                console.log(`    - The guest server crashed or failed to start`);
            }
        }

        console.log(`\nPlease ensure:`);
        console.log(`  1. The WinBoat container is running`);
        console.log(`  2. The guest server is running inside the container`);
        console.log(`  3. Port ${detectedPort || 7148} is mapped correctly`);
        console.log(`\nTroubleshooting steps:`);
        console.log(`  - Check container logs: docker logs WinBoat | grep -i "guest\\|7148"`);
        console.log(`  - Check port mappings: docker port WinBoat | grep 7148`);
        console.log(`  - Check if guest server is running: docker exec WinBoat tasklist | findstr winboat`);
        console.log(`  - Try accessing API directly: curl http://localhost:${detectedPort || 7148}/health`);
        if (detectedPort && detectedPort !== 7148) {
            console.log(`\n  Note: Detected API port ${detectedPort}, but it's not accessible.`);
            console.log(`  Try manually: winboat --api-url http://localhost:${detectedPort} --status`);
        } else if (!detectedPort) {
            console.log(`\n  Note: Could not detect port mapping. The container may use a different port range.`);
            console.log(`  Check: docker ps --filter name=WinBoat --format '{{.Ports}}'`);
        }
        process.exit(1);
    }
}

async function detectAndUpdateApiUrl(apiUrl: string): Promise<string> {
    // If using default localhost:7148, try to detect actual port
    if (apiUrl === "http://localhost:7148" || apiUrl === "http://127.0.0.1:7148") {
        const detectedPort = await getApiPort();
        if (detectedPort && detectedPort !== 7148) {
            const urlObj = new URL(apiUrl);
            urlObj.port = detectedPort.toString();
            // Remove trailing slash if present
            let result = urlObj.toString();
            if (result.endsWith('/')) {
                result = result.slice(0, -1);
            }
            return result;
        }
    }
    // Remove trailing slash if present
    if (apiUrl.endsWith('/')) {
        return apiUrl.slice(0, -1);
    }
    return apiUrl;
}

async function main() {
    const options = parseArgs();

    // Check API health first (except for help)
    if (!options.status && !options.list && !options.install && !options.launch) {
        showHelp();
        process.exit(0);
    }

    // Auto-detect API port if using default
    const finalApiUrl = await detectAndUpdateApiUrl(options.apiUrl);
    if (finalApiUrl !== options.apiUrl) {
        console.log(`Auto-detected API port, using: ${finalApiUrl}\n`);
    }

    try {
        if (options.status) {
            await showStatus(finalApiUrl);
        } else if (options.list) {
            const containerStatus = await checkContainerStatus();
            const isHealthy = await checkApiHealth(finalApiUrl, true);
            if (!isHealthy) {
                console.error("\nError: WinBoat API is not accessible.");
                if (containerStatus.exists) {
                    if (!containerStatus.running) {
                        console.error(`\nThe WinBoat container exists but is not running.`);
                        console.error(`\nTo start it:`);
                        console.error(`  docker start ${containerStatus.name || "WinBoat"}`);
                        console.error(`  or`);
                        console.error(`  podman start ${containerStatus.name || "WinBoat"}`);
                        console.error(`\nOr use the WinBoat GUI application to start the container.`);
                    } else {
                        console.error(`\nThe container is running but the API is not accessible.`);
                        console.error(`This might indicate:`);
                        console.error(`  - The guest server is not running inside the container`);
                        console.error(`  - Port mapping issues`);
                        console.error(`  - Wrong API URL (current: ${finalApiUrl})`);
                    }
                } else {
                    console.error(`\nNo WinBoat container found.`);
                    console.error(`\nPlease:`);
                    console.error(`  1. Install and set up WinBoat using the GUI application`);
                    console.error(`  2. Or create a container manually`);
                }
                console.error(`\nTroubleshooting:`);
                console.error(`  - Check container: docker ps -a | grep WinBoat`);
                console.error(`  - Check API: curl ${finalApiUrl}/health`);
                process.exit(1);
            }
            await listApps(finalApiUrl);
        } else if (options.install) {
            const containerStatus = await checkContainerStatus();
            const isHealthy = await checkApiHealth(finalApiUrl, true);
            if (!isHealthy) {
                console.error("\nError: WinBoat API is not accessible.");
                if (containerStatus.exists && !containerStatus.running) {
                    console.error(`\nThe WinBoat container exists but is not running.`);
                    console.error(`\nTo start it:`);
                    console.error(`  docker start ${containerStatus.name || "WinBoat"}`);
                    console.error(`  or`);
                    console.error(`  podman start ${containerStatus.name || "WinBoat"}`);
                } else if (!containerStatus.exists) {
                    console.error(`\nNo WinBoat container found. Please set up WinBoat first.`);
                } else {
                    console.error(`\nThe container is running but the API is not accessible.`);
                    const detectedPort = await getApiPort();
                    if (detectedPort && detectedPort !== 7148) {
                        console.error(`\n  Detected API port: ${detectedPort}`);
                        console.error(`  Try: winboat --api-url http://localhost:${detectedPort} -i <file>`);
                    }
                }
                process.exit(1);
            }
            await installApp(finalApiUrl, options.install);
        } else if (options.launch) {
            const containerStatus = await checkContainerStatus();
            const isHealthy = await checkApiHealth(finalApiUrl, true);
            if (!isHealthy) {
                console.error("\nError: WinBoat API is not accessible.");
                if (containerStatus.exists && !containerStatus.running) {
                    console.error(`\nThe WinBoat container exists but is not running.`);
                    console.error(`\nTo start it:`);
                    console.error(`  docker start ${containerStatus.name || "WinBoat"}`);
                    console.error(`  or`);
                    console.error(`  podman start ${containerStatus.name || "WinBoat"}`);
                } else if (!containerStatus.exists) {
                    console.error(`\nNo WinBoat container found. Please set up WinBoat first.`);
                } else {
                    console.error(`\nThe container is running but the API is not accessible.`);
                    const detectedPort = await getApiPort();
                    if (detectedPort && detectedPort !== 7148) {
                        console.error(`\n  Detected API port: ${detectedPort}`);
                        console.error(`  Try: winboat --api-url http://localhost:${detectedPort} -l "<app>"`);
                    }
                }
                process.exit(1);
            }
            await launchApp(finalApiUrl, options.launch);
        } else {
            console.error("Error: No action specified");
            console.error("Use -h or --help for usage information");
            process.exit(1);
        }
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
