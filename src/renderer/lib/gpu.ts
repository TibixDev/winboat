import { execFileAsync } from "./exec-helper";

const fs: typeof import("node:fs") = require("node:fs");
const path: typeof import("node:path") = require("node:path");

export type RenderDevice = {
    path: string;
    name: string;
    driver: string;
    vramGB?: number;
};

function readProperties(text: string): Record<string, string> {
    return Object.fromEntries(
        text
            .split("\n")
            .map(line => line.split("=", 2))
            .filter(parts => parts.length === 2),
    );
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
    const vramPath = path.join(sysfsPath, "mem_info_vram_total");
    const vramBytes = fs.existsSync(vramPath) ? Number(fs.readFileSync(vramPath, "utf8").trim()) : 0;

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
