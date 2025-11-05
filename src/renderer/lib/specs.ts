import { getFreeRDP } from "../utils/getFreeRDP";
import { ContainerSpecs } from "./containers/common";
const fs: typeof import("fs") = require("node:fs");
const os: typeof import("os") = require("node:os");
const { exec }: typeof import("child_process") = require("node:child_process");
const { promisify }: typeof import("util") = require("node:util");
const execAsync = promisify(exec);

export function satisfiesPrequisites(specs: Specs, containerSpecs?: ContainerSpecs) {
    return (
        containerSpecs &&
        Object.values(containerSpecs).every(x => x) &&
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
    freeRDP3Installed: false,
    rdpPortAvailable: true,
    xrdpRunning: false,
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

    // FreeRDP 3.x.x check (including Flatpak)
    try {
        const freeRDPBin = await getFreeRDP();
        specs.freeRDP3Installed = !!freeRDPBin;
    } catch (e) {
        console.error("Error checking FreeRDP 3.x.x installation (most likely not installed):", e);
    }

    // Check if port 3389 is available and if xrdp is running
    try {
        const portCheckResult = await checkRDPPort();
        specs.rdpPortAvailable = portCheckResult.available;
        specs.xrdpRunning = portCheckResult.xrdpRunning;
    } catch (e) {
        console.error("Error checking RDP port availability:", e);
    }

    console.log("Specs:", specs);
    return specs;
}

export async function checkRDPPort() {
    const result = {
        available: true,
        xrdpRunning: false,
    };

    try {
        // Check if xrdp service is running
        const { stdout: xrdpStatus } = await execAsync("systemctl is-active xrdp 2>/dev/null || echo 'inactive'");
        result.xrdpRunning = xrdpStatus.trim() === "active";
    } catch (e) {
        // Service might not exist, which is fine
        console.log("xrdp service check failed (service might not exist):", e);
    }

    try {
        // Check if port 3389 is in use using ss command
        const { stdout: portCheck } = await execAsync(
            "ss -tuln | grep ':3389 ' | grep -v '127.0.0.1:3389' || echo 'available'"
        );
        // If we get output other than 'available', the port is in use
        result.available = portCheck.trim() === "available";
    } catch (e) {
        console.error("Error checking port 3389:", e);
        // On error, assume port is available
        result.available = true;
    }

    return result;
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
        const totalMemLine = memInfo.split("\n").find((line: string) => line.startsWith("MemTotal"));
        const availableMemLine = memInfo.split("\n").find((line: string) => line.startsWith("MemAvailable"));
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
