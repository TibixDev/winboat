#!/usr/bin/env node
/**
 * WinBoat CLI - App Installation Tool
 * 
 * Usage:
 *   npm run install-app <path-to-installer>
 *   or
 *   node scripts/install-app.ts <path-to-installer>
 * 
 * Example:
 *   npm run install-app ~/Downloads/app.msi
 */

import { Winboat } from "../src/renderer/lib/winboat";
import { WinboatConfig } from "../src/renderer/lib/config";
import * as fs from "fs";
import * as path from "path";

const args = process.argv.slice(2);

if (args.length === 0) {
    console.error("Error: No installer file specified");
    console.log("\nUsage: npm run install-app <path-to-installer>");
    console.log("Example: npm run install-app ~/Downloads/app.msi");
    process.exit(1);
}

const installerPath = path.resolve(args[0]);

// Validate file exists
if (!fs.existsSync(installerPath)) {
    console.error(`Error: File not found: ${installerPath}`);
    process.exit(1);
}

// Validate file extension
const ext = path.extname(installerPath).toLowerCase();
if (ext !== ".exe" && ext !== ".msi") {
    console.error(`Error: Invalid file type. Only .exe and .msi files are supported.`);
    process.exit(1);
}

async function main() {
    console.log(`Installing application from: ${installerPath}`);
    
    try {
        // Initialize WinBoat instance
        const winboat = Winboat.getInstance();
        const config = WinboatConfig.getInstance();
        
        // Check if container is running
        if (winboat.containerStatus.value !== "running") {
            console.error("Error: WinBoat container is not running.");
            console.log("Please start the container first using the WinBoat application.");
            process.exit(1);
        }
        
        // Wait for API to be online
        console.log("Waiting for WinBoat API to be online...");
        let attempts = 0;
        const maxAttempts = 30;
        
        while (!winboat.isOnline.value && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        
        if (!winboat.isOnline.value) {
            console.error("Error: WinBoat API is not online. Please check the container status.");
            process.exit(1);
        }
        
        console.log("WinBoat API is online. Uploading installer...");
        
        // Upload and install
        await winboat.uploadAndInstall(installerPath);
        
        console.log("✓ Installation started successfully!");
        console.log("The application will appear in your app list shortly.");
        console.log("Note: It may take a few moments for the app to be discovered.");
        
    } catch (error: any) {
        console.error(`Error: ${error.message || "Unknown error occurred"}`);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main();

