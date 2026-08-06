import { execFileAsync } from "./exec-helper";
import { GPU_VRAM_RESERVE_GB, MAX_GPU_VRAM_GB, UNKNOWN_GPU_VRAM_MAX_GB } from "./constants";

const fs: typeof import("node:fs") = require("node:fs");
const path: typeof import("node:path") = require("node:path");

export type RenderDevice = {
    path: string;
    name: string;
    driver: string;
    vramGB?: number;
};

export function getGpuVramMaxGB(hostVramGB?: number): number {
    if (hostVramGB === undefined) return UNKNOWN_GPU_VRAM_MAX_GB;

    const reservableVramGB = hostVramGB > GPU_VRAM_RESERVE_GB ? hostVramGB - GPU_VRAM_RESERVE_GB : hostVramGB;

    return Math.max(1, Math.min(MAX_GPU_VRAM_GB, Math.floor(reservableVramGB)));
}

function readProperties(text: string): Record<string, string> {
    return Object.fromEntries(
        text
            .split("\n")
            .map(line => line.split("=", 2))
            .filter(parts => parts.length === 2),
    );
}

function readSysfsVramBytes(sysfsPath: string): number {
    const vramPath = path.join(sysfsPath, "mem_info_vram_total");
    if (!fs.existsSync(vramPath)) return 0;

    try {
        const vramBytes = Number(fs.readFileSync(vramPath, "utf8").trim());
        return Number.isFinite(vramBytes) && vramBytes > 0 ? vramBytes : 0;
    } catch {
        return 0;
    }
}

async function readNvidiaVramBytes(sysfsPath: string, properties: Record<string, string>): Promise<number> {
    let pciAddress = properties.PCI_SLOT_NAME;

    if (!pciAddress) {
        try {
            pciAddress = path.basename(fs.realpathSync(sysfsPath));
        } catch {
            return 0;
        }
    }

    try {
        const { stdout } = await execFileAsync("nvidia-smi", [
            `--id=${pciAddress}`,
            "--query-gpu=memory.total",
            "--format=csv,noheader,nounits",
        ]);
        const vramMiB = Number(stdout.trim());

        return Number.isFinite(vramMiB) && vramMiB > 0 ? vramMiB * 1024 ** 2 : 0;
    } catch {
        return 0;
    }
}

async function inspectRenderDevice(devicePath: string): Promise<RenderDevice> {
    const sysfsPath = path.join("/sys/class/drm", path.basename(devicePath), "device");
    let properties: Record<string, string> = {};

    try {
        const { stdout } = await execFileAsync("udevadm", ["info", "--query=property", `--path=${sysfsPath}`]);
        properties = readProperties(stdout);
    } catch {
        try {
            properties = readProperties(fs.readFileSync(path.join(sysfsPath, "uevent"), "utf8"));
        } catch {
            // The render node path itself is still useful as a final fallback.
        }
    }

    const vendor = properties.ID_VENDOR_FROM_DATABASE;
    const model = properties.ID_MODEL_FROM_DATABASE;
    const pciId = properties.PCI_ID;
    const name = [vendor, model].filter(Boolean).join(" ") || (pciId ? `PCI GPU ${pciId}` : path.basename(devicePath));
    let vramBytes = readSysfsVramBytes(sysfsPath);

    if (vramBytes <= 0 && (properties.DRIVER === "nvidia" || pciId?.toUpperCase().startsWith("10DE:"))) {
        vramBytes = await readNvidiaVramBytes(sysfsPath, properties);
    }

    return {
        path: devicePath,
        name,
        driver: properties.DRIVER || "unknown",
        ...(vramBytes > 0 ? { vramGB: Math.max(1, Math.round(vramBytes / 1024 ** 3)) } : {}),
    };
}

export async function getRenderDevices(): Promise<RenderDevice[]> {
    const driPath = "/dev/dri";
    if (!fs.existsSync(driPath)) return [];

    let paths: string[];
    try {
        paths = fs
            .readdirSync(driPath)
            .filter(name => /^renderD\d+$/.test(name))
            .map(name => path.join(driPath, name))
            .sort();
    } catch {
        return [];
    }

    return Promise.all(paths.map(inspectRenderDevice));
}
