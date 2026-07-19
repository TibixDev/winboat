import { WINBOAT_DIR } from "../constants";
import { RootlessPortForwardError } from "./rootless-port-forward-definition";

const fs: typeof import("node:fs") = require("node:fs");
const path: typeof import("node:path") = require("node:path");
const processRef: typeof import("node:process") = require("node:process");

type BinaryPathOptions = {
    readonly cwd?: string;
    readonly resourcesPath?: string;
    readonly winboatDir?: string;
    readonly existsSync?: (path: string) => boolean;
};

export function goArchFromNodeArch(nodeArch: string): string {
    if (nodeArch === "arm64") return "arm64";
    if (nodeArch === "x64") return "amd64";
    throw new RootlessPortForwardError(
        "unsupported_arch",
        `unsupported Node arch "${nodeArch}"; guest-port-forward only ships linux/arm64 and linux/amd64`,
    );
}

export function candidateGuestPortForwardPaths(
    nodeArch: string = processRef.arch,
    options?: BinaryPathOptions,
): readonly string[] {
    const name = `guest-port-forward-linux-${goArchFromNodeArch(nodeArch)}`;
    const cwd = options?.cwd ?? processRef.cwd();
    const resources = options?.resourcesPath ?? processRef.resourcesPath ?? "";
    const dataDir = options?.winboatDir ?? WINBOAT_DIR;
    return [
        resources ? path.join(resources, "guest-port-forward", name) : "",
        path.join(cwd, "tools", "guest-port-forward", "dist", name),
        path.join(dataDir, "bin", name),
    ].filter(Boolean);
}

export function resolveGuestPortForwardBinary(
    nodeArch: string = processRef.arch,
    options?: BinaryPathOptions,
): string | null {
    const exists = options?.existsSync ?? fs.existsSync;
    for (const candidate of candidateGuestPortForwardPaths(nodeArch, options)) {
        if (exists(candidate)) return candidate;
    }
    return null;
}

export function hostForwarderBinaryPath(
    nodeArch: string = processRef.arch,
    options?: BinaryPathOptions,
): string {
    const found = resolveGuestPortForwardBinary(nodeArch, options);
    if (found) return found;
    const goArch = goArchFromNodeArch(nodeArch);
    throw new RootlessPortForwardError(
        "binary_missing",
        `guest-port-forward binary missing for linux/${goArch}. Run bun run build:gpf before starting WinBoat.`,
    );
}
