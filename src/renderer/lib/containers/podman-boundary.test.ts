import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import type { ComposeConfig } from "../../../types";
import { PODMAN_DEFAULT_COMPOSE } from "../../data/podman";
import { PodmanContainer, type PodmanCommand } from "./podman";

class ExitError extends Error {
    constructor(readonly code: number) {
        super(`exit ${code}`);
    }
}

const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

function compose(overrides?: {
    platform?: "linux/arm64" | "linux/amd64";
    volumes?: string[];
    version?: string;
}): ComposeConfig {
    const config: ComposeConfig = {
        ...PODMAN_DEFAULT_COMPOSE,
        services: {
            windows: {
                ...PODMAN_DEFAULT_COMPOSE.services.windows,
                environment: { ...PODMAN_DEFAULT_COMPOSE.services.windows.environment },
                platform: overrides?.platform ?? "linux/arm64",
                volumes: [...(overrides?.volumes ?? PODMAN_DEFAULT_COMPOSE.services.windows.volumes)],
            },
        },
    };
    if (overrides?.version !== undefined) {
        Reflect.set(config.services.windows.environment, "VERSION", overrides.version);
    }
    return config;
}

function containerWithCompose(config: ComposeConfig, command: PodmanCommand): PodmanContainer {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "winboat-preflight-"));
    temporaryDirectories.push(directory);
    const composeFilePath = path.join(directory, "podman-compose.yml");
    fs.writeFileSync(composeFilePath, YAML.stringify(config));
    const container = new PodmanContainer(command, "arm64");
    container.composeFilePath = composeFilePath;
    return container;
}

describe("Podman mutation architecture boundary", () => {
    test("compose up rejects equivalent arm64 custom ISO destinations without Podman mutation", async () => {
        for (const destination of ["/boot.iso", "/./boot.iso", "//boot.iso", "/tmp/../boot.iso", "/./custom.iso"]) {
            const calls: string[][] = [];
            const command: PodmanCommand = async args => {
                calls.push(args);
                return { stdout: "", stderr: "" };
            };
            const container = containerWithCompose(
                compose({ volumes: [`/safe/windows.iso:${destination}:ro`] }),
                command,
            );

            await expect(container.compose("up")).rejects.toMatchObject({ code: "unverified_guest_arch" });
            expect(calls).toEqual([]);
        }
    });

    test("compose up rejects an arm64 custom VERSION URL before invoking Podman", async () => {
        const calls: string[][] = [];
        const command: PodmanCommand = async args => {
            calls.push(args);
            return { stdout: "", stderr: "" };
        };
        const container = containerWithCompose(
            compose({ version: "https://example.invalid/windows-x64.iso" }),
            command,
        );

        await expect(container.compose("up")).rejects.toMatchObject({ code: "unverified_guest_arch" });
        expect(calls).toEqual([]);
    });

    test("image presence errors do not pull or run compose", async () => {
        const calls: string[][] = [];
        const command: PodmanCommand = async args => {
            calls.push(args);
            if (args[0] === "image" && args[1] === "exists") throw new ExitError(125);
            return { stdout: "", stderr: "" };
        };
        const container = containerWithCompose(compose(), command);

        await expect(container.compose("up")).rejects.toMatchObject({ code: "image_exists_failed" });
        expect(calls).toHaveLength(1);
        expect(calls.some(args => args[0] === "pull" || args[0] === "compose")).toBe(false);
    });

    test("start rejects the actual container image mismatch before the action", async () => {
        const calls: string[][] = [];
        const command: PodmanCommand = async args => {
            calls.push(args);
            const joined = args.join(" ");
            if (joined.startsWith("image exists")) return { stdout: "", stderr: "" };
            if (joined.includes("image inspect") && joined.includes("sha256:actual")) {
                return { stdout: "amd64\n", stderr: "" };
            }
            if (joined.startsWith("image inspect")) return { stdout: "arm64\n", stderr: "" };
            if (joined.includes("container inspect --format={{.Image}}")) {
                return { stdout: "sha256:actual\n", stderr: "" };
            }
            if (joined.includes("range .Mounts")) return { stdout: "/storage\n", stderr: "" };
            if (joined.includes("range .Config.Env")) return { stdout: "11\n", stderr: "" };
            throw new Error(`unexpected command: ${joined}`);
        };
        const container = containerWithCompose(compose(), command);

        await expect(container.container("start")).rejects.toMatchObject({ code: "container_arch_mismatch" });
        expect(calls.some(args => args[0] === "container" && args[1] === "start")).toBe(false);
    });

    test("unpause rejects an actual /boot.iso mount before the action", async () => {
        const calls: string[][] = [];
        const command: PodmanCommand = async args => {
            calls.push(args);
            const joined = args.join(" ");
            if (joined.startsWith("image exists")) return { stdout: "", stderr: "" };
            if (joined.startsWith("image inspect")) return { stdout: "arm64\n", stderr: "" };
            if (joined.includes("container inspect --format={{.Image}}")) {
                return { stdout: "sha256:actual\n", stderr: "" };
            }
            if (joined.includes("range .Mounts")) return { stdout: "/storage\n/boot.iso\n", stderr: "" };
            throw new Error(`unexpected command: ${joined}`);
        };
        const container = containerWithCompose(compose(), command);

        await expect(container.container("unpause")).rejects.toMatchObject({ code: "unverified_guest_arch" });
        expect(calls.some(args => args[0] === "container" && args[1] === "unpause")).toBe(false);
    });

    test("restart rejects an actual /custom.iso mount before the action", async () => {
        const calls: string[][] = [];
        const command: PodmanCommand = async args => {
            calls.push(args);
            const joined = args.join(" ");
            if (joined.startsWith("image exists")) return { stdout: "", stderr: "" };
            if (joined.startsWith("image inspect")) return { stdout: "arm64\n", stderr: "" };
            if (joined.includes("container inspect --format={{.Image}}")) {
                return { stdout: "sha256:actual\n", stderr: "" };
            }
            if (joined.includes("range .Mounts")) return { stdout: "/storage\n/custom.iso\n", stderr: "" };
            throw new Error(`unexpected command: ${joined}`);
        };
        const container = containerWithCompose(compose(), command);

        await expect(container.container("restart")).rejects.toMatchObject({ code: "unverified_guest_arch" });
        expect(calls.some(args => args[0] === "container" && args[1] === "restart")).toBe(false);
    });
});
