import { execFileAsync } from "./exec-helper";
import { GPU_VRAM_RESERVE_GB, MAX_GPU_VRAM_GB, UNKNOWN_GPU_VRAM_MAX_GB } from "./constants";
import YAML from "yaml";

const fs: typeof import("node:fs") = require("node:fs");
const path: typeof import("node:path") = require("node:path");

export type RenderDevice = {
    path: string;
    name: string;
    driver: string;
    pciId?: string;
    vramGB?: number;
    nvidiaUuid?: string;
};

type NvidiaGpuInfo = {
    vramBytes: number;
    uuid?: string;
};

export function requiresNvidiaContainerSupport(device?: RenderDevice): boolean {
    return device?.driver.toLowerCase() === "nvidia";
}

export function shouldCheckNvidiaContainerSupport(gpuEnabled: boolean, device?: RenderDevice): boolean {
    return gpuEnabled && requiresNvidiaContainerSupport(device);
}

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

async function readNvidiaGpuInfo(
    sysfsPath: string,
    properties: Record<string, string>,
): Promise<NvidiaGpuInfo | undefined> {
    let pciAddress = properties.PCI_SLOT_NAME;

    if (!pciAddress) {
        try {
            pciAddress = path.basename(fs.realpathSync(sysfsPath));
        } catch {
            return undefined;
        }
    }

    try {
        const { stdout } = await execFileAsync("nvidia-smi", [
            `--id=${pciAddress}`,
            "--query-gpu=memory.total,uuid",
            "--format=csv,noheader,nounits",
        ]);
        const [vramText, uuid] = stdout
            .trim()
            .split(",", 2)
            .map(value => value.trim());
        const vramMiB = Number(vramText);

        return {
            vramBytes: Number.isFinite(vramMiB) && vramMiB > 0 ? vramMiB * 1024 ** 2 : 0,
            ...(uuid?.startsWith("GPU-") ? { uuid } : {}),
        };
    } catch {
        return undefined;
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
    let nvidiaInfo: NvidiaGpuInfo | undefined;

    if (properties.DRIVER === "nvidia" || pciId?.toUpperCase().startsWith("10DE:")) {
        nvidiaInfo = await readNvidiaGpuInfo(sysfsPath, properties);
        if (vramBytes <= 0) vramBytes = nvidiaInfo?.vramBytes || 0;
    }

    return {
        path: devicePath,
        name,
        driver: properties.DRIVER || "unknown",
        ...(pciId ? { pciId } : {}),
        ...(vramBytes > 0 ? { vramGB: Math.max(1, Math.round(vramBytes / 1024 ** 3)) } : {}),
        ...(nvidiaInfo?.uuid ? { nvidiaUuid: nvidiaInfo.uuid } : {}),
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

type CdiSpec = {
    kind?: string;
    devices?: Array<{ name?: string }>;
};

export function nvidiaCdiSpecProvidesGpu(text: string, nvidiaUuid: string): boolean {
    try {
        return YAML.parseAllDocuments(text).some(document => {
            if (document.errors.length) return false;

            const spec = document.toJS() as CdiSpec | null;
            if (spec?.kind !== "nvidia.com/gpu") return false;

            return spec.devices?.some(device => device.name === nvidiaUuid) === true;
        });
    } catch {
        return false;
    }
}

function hasNvidiaCdiDevice(specDirs: string[], nvidiaUuid: string): boolean {
    for (const specDir of specDirs) {
        let entries: import("node:fs").Dirent[];

        try {
            entries = fs.readdirSync(specDir, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            if (!entry.isFile() && !entry.isSymbolicLink()) continue;

            try {
                const text = fs.readFileSync(path.join(specDir, entry.name), "utf8");
                if (nvidiaCdiSpecProvidesGpu(text, nvidiaUuid)) return true;
            } catch {
                // Ignore stale or unreadable CDI entries and continue checking the daemon's other spec directories.
            }
        }
    }

    return false;
}

export async function hasNvidiaContainerSupport(nvidiaUuid: string): Promise<boolean> {
    try {
        const { stdout } = await execFileAsync("docker", ["info", "--format", "{{json .Runtimes}}"]);
        const runtimes = JSON.parse(stdout) as Record<string, unknown>;
        if (Object.hasOwn(runtimes, "nvidia")) return true;
    } catch {
        // Docker 29 can use NVIDIA CDI devices without a named nvidia runtime.
    }

    try {
        const { stdout } = await execFileAsync("docker", ["info", "--format", "{{json .CDISpecDirs}}"]);
        const specDirs = JSON.parse(stdout) as unknown;
        return (
            Array.isArray(specDirs) &&
            hasNvidiaCdiDevice(
                specDirs.filter(value => typeof value === "string"),
                nvidiaUuid,
            )
        );
    } catch {
        return false;
    }
}
