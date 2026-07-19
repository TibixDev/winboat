export class ArchitectureBoundaryError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "ArchitectureBoundaryError";
        this.code = code;
    }
}

export function containerArchitectureForNode(nodeArch: string): "arm64" | "amd64" {
    if (nodeArch === "arm64") return "arm64";
    if (nodeArch === "x64") return "amd64";
    throw new ArchitectureBoundaryError(
        "unsupported_arch",
        `unsupported host architecture ${JSON.stringify(nodeArch)}; WinBoat supports arm64 and x64 hosts`,
    );
}

export function composePlatformForNode(nodeArch: string): "linux/arm64" | "linux/amd64" {
    return `linux/${containerArchitectureForNode(nodeArch)}`;
}

export function assertContainerImageArchitecture(nodeArch: string, imageArch: string): void {
    const expected = containerArchitectureForNode(nodeArch);
    const normalized = imageArch.trim().toLowerCase().replace("aarch64", "arm64").replace("x86_64", "amd64");
    if (normalized !== expected) {
        throw new ArchitectureBoundaryError(
            "container_arch_mismatch",
            `refusing to start WinBoat: host ${nodeArch} requires a ${expected} container image, got ${JSON.stringify(imageArch.trim())}`,
        );
    }
}

export function assertGuestImagePolicy(nodeArch: string, customIsoPath?: string): void {
    containerArchitectureForNode(nodeArch);
    if (nodeArch === "arm64" && customIsoPath) {
        throw new ArchitectureBoundaryError(
            "unverified_guest_arch",
            "custom Windows ISO architecture cannot be verified before boot on arm64; use WinBoat automatic Windows 11 ARM media",
        );
    }
}
