import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import type { ComposeConfig } from "../../../types";
import { DOCKER_DEFAULT_COMPOSE } from "../../data/docker";
import { DockerContainer } from "./docker";

const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

function dockerWithCompose(config: ComposeConfig): DockerContainer {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "winboat-docker-preflight-"));
    temporaryDirectories.push(directory);
    const container = new DockerContainer("arm64");
    container.composeFilePath = path.join(directory, "docker-compose.yml");
    fs.writeFileSync(container.composeFilePath, YAML.stringify(config));
    return container;
}

function compose(platform: "linux/arm64" | "linux/amd64", volumes: string[] = []): ComposeConfig {
    return {
        ...DOCKER_DEFAULT_COMPOSE,
        services: {
            windows: {
                ...DOCKER_DEFAULT_COMPOSE.services.windows,
                environment: { ...DOCKER_DEFAULT_COMPOSE.services.windows.environment },
                platform,
                volumes,
            },
        },
    };
}

describe("Docker static architecture preflight", () => {
    test("rejects an amd64 platform on an arm64 host", async () => {
        await expect(dockerWithCompose(compose("linux/amd64")).preflight()).rejects.toMatchObject({
            code: "compose_platform_mismatch",
        });
    });

    test("rejects custom installer media on an arm64 host", async () => {
        await expect(
            dockerWithCompose(compose("linux/arm64", ["/safe/windows.iso:/custom.iso:ro"])).preflight(),
        ).rejects.toMatchObject({ code: "unverified_guest_arch" });
    });

    test("accepts the automatic ARM media selector", async () => {
        await expect(dockerWithCompose(compose("linux/arm64")).preflight()).resolves.toBeUndefined();
    });
});
