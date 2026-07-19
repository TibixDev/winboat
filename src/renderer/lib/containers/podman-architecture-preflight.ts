import type { ComposeConfig } from "../../../types";
import {
    assertContainerImageArchitecture,
    composePlatformForNode,
    containerArchitectureForNode,
} from "./architecture";

export type PodmanExec = (args: readonly string[]) => Promise<string>;

export type PodmanArchitecturePlan = {
    readonly image: string;
    readonly platform: "linux/arm64" | "linux/amd64";
};

export type ExistingContainerIdentity = {
    readonly imageId: string;
    readonly mountDestinations: readonly string[];
};

const ARM64_AUTOMATIC_GUEST_VERSIONS = new Set(["11", "11l", "11e", "10", "10l", "10e"]);
const CUSTOM_INSTALLER_MEDIA_DESTINATIONS = new Set(["/boot.iso", "/custom.iso"]);
const ARM64_GUEST_VERSION_INSPECT_TEMPLATE =
    '{{range .Config.Env}}{{if eq (printf "%.8s" .) "VERSION="}}' +
    '{{if eq . "VERSION=11"}}11{{else if eq . "VERSION=11l"}}11l' +
    '{{else if eq . "VERSION=11e"}}11e{{else if eq . "VERSION=10"}}10' +
    '{{else if eq . "VERSION=10l"}}10l{{else if eq . "VERSION=10e"}}10e{{else}}!{{end}}' +
    '{{println}}{{end}}{{end}}';

export type PodmanArchitecturePreflightErrorCode =
    | "container_image_missing"
    | "compose_platform_mismatch"
    | "unverified_guest_arch"
    | "image_exists_failed"
    | "image_pull_failed"
    | "image_inspect_failed"
    | "container_image_inspect_failed"
    | "container_image_id_missing"
    | "container_mounts_inspect_failed"
    | "container_guest_version_inspect_failed"
    | "existing_image_inspect_failed";

export class PodmanArchitecturePreflightError extends Error {
    readonly name = "PodmanArchitecturePreflightError";

    constructor(
        readonly code: PodmanArchitecturePreflightErrorCode,
        message: string,
        cause?: unknown,
    ) {
        super(message, { cause });
    }
}

function isCustomInstallerMediaDestination(destination: string): boolean {
    const segments: string[] = [];
    for (const segment of destination.trim().split("/")) {
        if (segment.length === 0 || segment === ".") continue;
        if (segment === "..") {
            segments.pop();
            continue;
        }
        segments.push(segment);
    }
    return CUSTOM_INSTALLER_MEDIA_DESTINATIONS.has(`/${segments.join("/")}`);
}

export function validatePodmanComposeArchitecture(
    compose: ComposeConfig,
    nodeArch: string,
): PodmanArchitecturePlan {
    const service = compose.services?.windows;
    const image = service?.image?.trim() ?? "";
    if (image.length === 0) {
        throw new PodmanArchitecturePreflightError("container_image_missing", "WinBoat compose image is missing");
    }

    const platform = composePlatformForNode(nodeArch);
    if (service.platform !== undefined && service.platform !== platform) {
        throw new PodmanArchitecturePreflightError(
            "compose_platform_mismatch",
            `compose platform ${service.platform} does not match ${platform}`,
        );
    }

    const hasCustomInstallerMedia = service.volumes.some(volume =>
        volume
            .split(":")
            .slice(1)
            .some(isCustomInstallerMediaDestination),
    );
    const guestVersion = service.environment?.VERSION?.trim() ?? "";
    if (
        nodeArch === "arm64" &&
        (hasCustomInstallerMedia || !ARM64_AUTOMATIC_GUEST_VERSIONS.has(guestVersion))
    ) {
        throw new PodmanArchitecturePreflightError(
            "unverified_guest_arch",
            "arm64 requires automatic Windows ARM media; custom or unknown guest media is not allowed",
        );
    }

    return { image, platform };
}

export async function preflightPodmanArchitecture(
    compose: ComposeConfig,
    nodeArch: string,
    exec: PodmanExec,
): Promise<PodmanArchitecturePlan> {
    const plan = validatePodmanComposeArchitecture(compose, nodeArch);
    let requiresPull = false;
    try {
        await exec(["image", "exists", plan.image]);
    } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === 1) {
            requiresPull = true;
        } else {
            throw new PodmanArchitecturePreflightError(
                "image_exists_failed",
                `failed to determine whether Podman image ${plan.image} exists`,
                error,
            );
        }
    }

    if (requiresPull) {
        try {
            await exec(["pull", "--platform", plan.platform, plan.image]);
        } catch (error) {
            throw new PodmanArchitecturePreflightError(
                "image_pull_failed",
                `failed to pull Podman image ${plan.image}`,
                error,
            );
        }
    }

    let imageArchitecture: string;
    try {
        imageArchitecture = await exec(["image", "inspect", "--format={{.Architecture}}", plan.image]);
    } catch (error) {
        throw new PodmanArchitecturePreflightError(
            "image_inspect_failed",
            `failed to inspect Podman image ${plan.image}`,
            error,
        );
    }
    assertContainerImageArchitecture(nodeArch, imageArchitecture);
    return plan;
}

export async function inspectExistingContainerIdentity(
    containerName: string,
    exec: PodmanExec,
): Promise<ExistingContainerIdentity> {
    let imageId: string;
    try {
        imageId = (await exec(["container", "inspect", "--format={{.Image}}", containerName])).trim();
    } catch (error) {
        throw new PodmanArchitecturePreflightError(
            "container_image_inspect_failed",
            `failed to inspect the image ID of container ${containerName}`,
            error,
        );
    }
    if (imageId.length === 0) {
        throw new PodmanArchitecturePreflightError(
            "container_image_id_missing",
            `container ${containerName} has no image ID`,
        );
    }

    let mounts: string;
    try {
        mounts = await exec([
            "container",
            "inspect",
            "--format={{range .Mounts}}{{println .Destination}}{{end}}",
            containerName,
        ]);
    } catch (error) {
        throw new PodmanArchitecturePreflightError(
            "container_mounts_inspect_failed",
            `failed to inspect mount destinations of container ${containerName}`,
            error,
        );
    }

    return {
        imageId,
        mountDestinations: mounts.split("\n").map(destination => destination.trim()).filter(Boolean),
    };
}

export async function preflightExistingPodmanContainer(
    containerName: string,
    nodeArch: string,
    exec: PodmanExec,
): Promise<ExistingContainerIdentity> {
    containerArchitectureForNode(nodeArch);
    const identity = await inspectExistingContainerIdentity(containerName, exec);
    if (
        nodeArch === "arm64" &&
        identity.mountDestinations.some(isCustomInstallerMediaDestination)
    ) {
        throw new PodmanArchitecturePreflightError(
            "unverified_guest_arch",
            `arm64 container ${containerName} has unverified installer media mounted`,
        );
    }

    if (nodeArch === "arm64") {
        let guestVersion: string;
        try {
            guestVersion = (
                await exec([
                    "container",
                    "inspect",
                    `--format=${ARM64_GUEST_VERSION_INSPECT_TEMPLATE}`,
                    containerName,
                ])
            ).trim();
        } catch (error) {
            throw new PodmanArchitecturePreflightError(
                "container_guest_version_inspect_failed",
                `failed to verify automatic Windows ARM media for container ${containerName}`,
                error,
            );
        }
        const guestVersions = guestVersion.split(/\s+/).filter(Boolean);
        if (guestVersions.length !== 1 || !ARM64_AUTOMATIC_GUEST_VERSIONS.has(guestVersions[0] ?? "")) {
            throw new PodmanArchitecturePreflightError(
                "unverified_guest_arch",
                `arm64 container ${containerName} does not use verified automatic Windows ARM media`,
            );
        }
    }

    let imageArchitecture: string;
    try {
        imageArchitecture = await exec([
            "image",
            "inspect",
            "--format={{.Architecture}}",
            identity.imageId,
        ]);
    } catch (error) {
        throw new PodmanArchitecturePreflightError(
            "existing_image_inspect_failed",
            `failed to inspect the actual image of container ${containerName}`,
            error,
        );
    }
    assertContainerImageArchitecture(nodeArch, imageArchitecture);
    return identity;
}
