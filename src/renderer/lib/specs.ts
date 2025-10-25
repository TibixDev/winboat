import { getFreeRDP } from "../utils/getFreeRDP";
const fs: typeof import("fs") = require("node:fs");
const os: typeof import("os") = require("node:os");
const { exec }: typeof import("child_process") = require("node:child_process");
const { promisify }: typeof import("util") = require("node:util");
const execAsync = promisify(exec);

export function satisfiesPrequisites(specs: Specs) {
    return (
        specs.dockerInstalled &&
        specs.dockerComposeInstalled &&
        specs.dockerIsRunning &&
        specs.dockerIsInUserGroups &&
        specs.freeRDP3Installed &&
        specs.kvmEnabled &&
        specs.ramGB >= 4 &&
        specs.cpuCores >= 2
    );
}

export const defaultSpecs: Specs = {
    cpuCores: 0,
    ramGB: 0,
    kvmEnabled: false,
    dockerInstalled: false,
    dockerComposeInstalled: false,
    dockerIsRunning: false,
    dockerIsInUserGroups: false,
    freeRDP3Installed: false,
};

export async function getSpecs() {
    const specs: Specs = { ...defaultSpecs };

    // Physical CPU cores check
    try {
        const res = (await execAsync('lscpu -p | egrep -v "^#" | sort -u -t, -k 2,4 | wc -l')).stdout;
        specs.cpuCores = Number.parseInt(res.trim(), 10);
    } catch (e) {
        console.error("Error getting CPU cores:", e);
    }

    // TODO: These commands might silently fail
    // But if they do, it means something wasn't right to begin with
    try {
        const memoryInfo = await getMemoryInfo();
        specs.ramGB = memoryInfo.totalGB;
    } catch (e) {
        console.error("Error reading /proc/meminfo:", e);
    }

    // KVM check
    try {
        const cpuInfo = fs.readFileSync("/proc/cpuinfo", "utf8");
        if ((cpuInfo.includes("vmx") || cpuInfo.includes("svm")) && fs.existsSync("/dev/kvm")) {
            specs.kvmEnabled = true;
        }
    } catch (e) {
        console.error("Error reading /proc/cpuinfo or checking /dev/kvm:", e);
    }

    // Docker check
    try {
        const { stdout: dockerOutput } = await execAsync("docker --version");
        specs.dockerInstalled = !!dockerOutput;
    } catch (e) {
        console.error("Error checking for Docker installation:", e);
    }

    // Docker Compose plugin check with version validation
    try {
        const { stdout: dockerComposeOutput } = await execAsync("docker compose version");
        if (dockerComposeOutput) {
            // Example output: "Docker Compose version v2.35.1"
            // Example output 2: "Docker Compose version 2.36.2"
            const versionMatch = new RegExp(/(\d+\.\d+\.\d+)/).exec(dockerComposeOutput);
            if (versionMatch) {
                const majorVersion = Number.parseInt(versionMatch[1].split(".")[0], 10);
                specs.dockerComposeInstalled = majorVersion >= 2;
            } else {
                specs.dockerComposeInstalled = false; // No valid version found
            }
        } else {
            specs.dockerComposeInstalled = false; // No output, plugin not installed
        }
    } catch (e) {
        console.error("Error checking Docker Compose version:", e);
    }

    // Docker is running check
    try {
        const { stdout: dockerOutput } = await execAsync("docker ps");
        specs.dockerIsRunning = !!dockerOutput;
    } catch (e) {
        console.error("Error checking if Docker is running:", e);
    }

    // Docker user group check
    try {
        const userGroups = (await execAsync("id -Gn")).stdout;
        specs.dockerIsInUserGroups = userGroups.split(/\s+/).includes("docker");
    } catch (e) {
        console.error("Error checking user groups for docker:", e);
    }

    // FreeRDP 3.x.x check (including Flatpak)
    try {
        const freeRDPBin = await getFreeRDP();
        specs.freeRDP3Installed = !!freeRDPBin;
    } catch (e) {
        console.error("Error checking FreeRDP 3.x.x installation (most likely not installed):", e);
    }

    console.log("Specs:", specs);
    return specs;
}

export type MemoryInfo = {
    totalGB: number;
    availableGB: number;
};

export async function getMemoryInfo() {
    try {
        const memoryInfo: MemoryInfo = {
            totalGB: 0,
            availableGB: 0,
        };
        const memInfo = fs.readFileSync("/proc/meminfo", "utf8");
        const totalMemLine = memInfo.split("\n").find(line => line.startsWith("MemTotal"));
        const availableMemLine = memInfo.split("\n").find(line => line.startsWith("MemAvailable"));
        if (totalMemLine) {
            memoryInfo.totalGB = Math.round((Number.parseInt(totalMemLine.split(/\s+/)[1]) / 1024 / 1024) * 100) / 100;
        }

        if (availableMemLine) {
            memoryInfo.availableGB =
                Math.round((Number.parseInt(availableMemLine.split(/\s+/)[1]) / 1024 / 1024) * 100) / 100;
        }

        return memoryInfo;
    } catch (e) {
        console.error("Error reading /proc/meminfo:", e);
        throw e;
    }
}
