import { getFreeRDP } from "../utils/getFreeRDP";
import { ContainerSpecs } from "./containers/common";
import { evaluateKvmEnabled, probeKvmDeviceAccess } from "./kvm";
const fs: typeof import("fs") = require("node:fs");
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

    // KVM check: /dev/kvm must exist and open O_RDWR for this user.
    // open fd is closed inside probeKvmDeviceAccess. No vmx/svm / arch-name gates.
    // Preflight is openability only — not a full KVM ioctl capability check.
    try {
        const probe = probeKvmDeviceAccess();
        specs.kvmEnabled = evaluateKvmEnabled(probe);
    } catch (e) {
        console.error("Error checking /dev/kvm:", e);
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
