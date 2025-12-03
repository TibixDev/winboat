#!/usr/bin/env node
/**
 * WinBoat CLI - App Installation Tool
 * 
 * This script installs applications by directly communicating with the WinBoat Guest Server API.
 * 
 * Usage:
 *   npm run install-app <path-to-installer> [--api-url=http://localhost:7148]
 *   or
 *   node scripts/install-app-cli.ts <path-to-installer> [--api-url=http://localhost:7148]
 * 
 * Example:
 *   npm run install-app ~/Downloads/app.msi
 *   npm run install-app ~/Downloads/app.exe --api-url=http://localhost:7148
 */

import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import { URL } from "url";
import FormData from "form-data";

interface CliOptions {
    installerPath: string;
    apiUrl: string;
}

function parseArgs(): CliOptions {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error("Error: No installer file specified");
        console.log("\nUsage: npm run install-app <path-to-installer> [--api-url=http://localhost:7148]");
        console.log("Example: npm run install-app ~/Downloads/app.msi");
        process.exit(1);
    }

    let installerPath = "";
    let apiUrl = "http://localhost:7148";

    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith("--api-url=")) {
            apiUrl = args[i].split("=")[1];
        } else if (!args[i].startsWith("--")) {
            installerPath = args[i];
        }
    }

    if (!installerPath) {
        console.error("Error: No installer file specified");
        process.exit(1);
    }

    return {
        installerPath: path.resolve(installerPath),
        apiUrl: apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl,
    };
}

function validateFile(filePath: string): void {
    if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
        console.error(`Error: Path is not a file: ${filePath}`);
        process.exit(1);
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".exe" && ext !== ".msi") {
        console.error(`Error: Invalid file type. Only .exe and .msi files are supported.`);
        console.error(`Found extension: ${ext}`);
        process.exit(1);
    }

    // Check file size (100MB limit)
    const fileSizeMB = stats.size / (1024 * 1024);
    if (fileSizeMB > 100) {
        console.error(`Error: File size exceeds 100MB limit. File size: ${fileSizeMB.toFixed(2)}MB`);
        process.exit(1);
    }
}

async function checkApiHealth(apiUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
        const url = new URL(`${apiUrl}/health`);
        const client = url.protocol === "https:" ? https : http;

        const req = client.get(url, (res) => {
            if (res.statusCode === 200) {
                resolve(true);
            } else {
                resolve(false);
            }
        });

        req.on("error", () => resolve(false));
        req.setTimeout(5000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function uploadInstaller(options: CliOptions): Promise<void> {
    return new Promise((resolve, reject) => {
        const form = new FormData();
        form.append("installer", fs.createReadStream(options.installerPath));

        const url = new URL(`${options.apiUrl}/upload-installer`);
        const client = url.protocol === "https:" ? https : http;

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
                    if (res.statusCode === 200) {
                        try {
                            const result = JSON.parse(data);
                            console.log("✓ Installation started successfully!");
                            console.log(`  Filename: ${result.filename}`);
                            console.log(`  Status: ${result.status}`);
                            resolve();
                        } catch (e) {
                            console.log("✓ Installation started (response received)");
                            resolve();
                        }
                    } else {
                        reject(new Error(`API returned status ${res.statusCode}: ${data}`));
                    }
                });
            }
        );

        req.on("error", (err) => {
            reject(new Error(`Request failed: ${err.message}`));
        });

        form.pipe(req);
    });
}

async function main() {
    const options = parseArgs();

    console.log(`WinBoat App Installer CLI`);
    console.log(`========================\n`);
    console.log(`Installer: ${options.installerPath}`);
    console.log(`API URL: ${options.apiUrl}\n`);

    // Validate file
    console.log("Validating installer file...");
    validateFile(options.installerPath);
    console.log("✓ File validation passed\n");

    // Check API health
    console.log("Checking WinBoat Guest Server API...");
    const isHealthy = await checkApiHealth(options.apiUrl);
    if (!isHealthy) {
        console.error("Error: WinBoat Guest Server API is not accessible.");
        console.error(`Please ensure:`);
        console.error(`  1. The WinBoat container is running`);
        console.error(`  2. The API is accessible at ${options.apiUrl}`);
        console.error(`  3. The API URL is correct (default: http://localhost:7148)`);
        process.exit(1);
    }
    console.log("✓ API is accessible\n");

    // Upload and install
    console.log("Uploading installer...");
    try {
        await uploadInstaller(options);
        console.log("\n✓ Installation process initiated!");
        console.log("The application will appear in your WinBoat app list shortly.");
        console.log("Note: It may take a few moments for the app to be discovered by Windows.");
    } catch (error: any) {
        console.error(`\n✗ Installation failed: ${error.message}`);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});


