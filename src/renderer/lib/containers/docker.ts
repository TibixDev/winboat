import { ComposeConfig } from "../../../types";
import { DOCKER_DEFAULT_COMPOSE } from "../../data/docker";
import { capitalizeFirstLetter } from "../../utils/capitalize";
import { ComposePortEntry } from "../../utils/port";
import { WINBOAT_DIR } from "../constants";
import {
    ComposeArguments,
    ComposeDirection,
    ContainerAction,
    containerLogger,
    ContainerManager,
    ContainerStatus,
} from "./container";
import YAML from "yaml";
import { execFileAsync, stringifyExecFile } from "../exec-helper";
import { hostExec } from "../flatpak-host";

const path: typeof import("node:path") = require("node:path");
const fs: typeof import("node:fs") = require("node:fs");

function dockerSpawn(args: string[]): { file: string; args: string[] } {
    return hostExec("docker", args);
}

export type DockerSpecs = {
    dockerInstalled: boolean;
    dockerComposeInstalled: boolean;
    dockerIsRunning: boolean;
    dockerIsInUserGroups: boolean;
};

export class DockerContainer extends ContainerManager {
    defaultCompose = DOCKER_DEFAULT_COMPOSE;
    composeFilePath = path.join(WINBOAT_DIR, "docker-compose.yml"); // TODO: If/when we support multiple VM's we need to put this in the constructor
    executableAlias = "docker";

    cachedPortMappings: ComposePortEntry[] | null = null;

    constructor() {
        super();
    }

    writeCompose(compose: ComposeConfig): void {
        const composeContent = YAML.stringify(compose, { nullStr: "" });
        fs.writeFileSync(this.composeFilePath, composeContent, { encoding: "utf-8" });

        containerLogger.info(`Wrote to compose file at: ${this.composeFilePath}`);
        containerLogger.info(`Compose file content: ${JSON.stringify(composeContent, null, 2)}`);
    }

    async compose(direction: ComposeDirection, extraArgs: ComposeArguments[] = []): Promise<void> {
        const args = ["compose", "-f", this.composeFilePath, direction, ...extraArgs];

        if (direction === "up") {
            // Run compose in detached mode if we are running compose up
            args.push("-d");
        }

        const sp = dockerSpawn(args);
        try {
            const { stderr } = await execFileAsync(sp.file, sp.args);
            if (stderr) {
                containerLogger.error(stderr);
            }
        } catch (e) {
            containerLogger.error(`Failed to run compose command '${stringifyExecFile(sp.file, sp.args)}'`);
            containerLogger.error(e);
            throw e;
        }
    }

    async container(action: ContainerAction): Promise<void> {
        const args = ["container", action, this.containerName];
        const sp = dockerSpawn(args);
        try {
            const { stdout } = await execFileAsync(sp.file, sp.args);
            containerLogger.info(`Container action '${action}' response: '${stdout}'`);
        } catch (e) {
            containerLogger.error(`Failed to run container action '${stringifyExecFile(sp.file, sp.args)}'`);
            containerLogger.error(e);
            throw e;
        }
    }

    async port(): Promise<ComposePortEntry[]> {
        const args = ["port", this.containerName];
        const ret = [];
        const sp = dockerSpawn(args);

        try {
            const { stdout } = await execFileAsync(sp.file, sp.args);

            for (const line of stdout.trim().split("\n")) {
                const parts = line.split("->").map(part => part.trim());
                const hostPart = parts[1];
                const containerPart = parts[0];

                ret.push(new ComposePortEntry(`${hostPart}:${containerPart}`));
            }
        } catch (e) {
            containerLogger.error(`Failed to run container action '${stringifyExecFile(sp.file, sp.args)}'`);
            containerLogger.error(e);
            throw e;
        }

        containerLogger.info("Docker container active port mappings: ", JSON.stringify(ret));
        this.cachedPortMappings = ret;
        return ret;
    }

    async remove(): Promise<void> {
        const args = ["rm", this.containerName];
        const sp = dockerSpawn(args);

        try {
            await execFileAsync(sp.file, sp.args);
        } catch (e) {
            containerLogger.error(`Failed to remove container '${this.containerName}'`);
            containerLogger.error(e);
        }
    }

    async getStatus(): Promise<ContainerStatus> {
        const statusMap = {
            created: ContainerStatus.CREATED,
            restarting: ContainerStatus.UNKNOWN,
            removing: ContainerStatus.UNKNOWN,
            running: ContainerStatus.RUNNING,
            paused: ContainerStatus.PAUSED,
            exited: ContainerStatus.EXITED,
            dead: ContainerStatus.UNKNOWN,
        } as const;
        const args = ["inspect", "--format={{.State.Status}}", this.containerName];
        const sp = dockerSpawn(args);
        try {
            const { stdout } = await execFileAsync(sp.file, sp.args);
            const status = stdout.trim() as keyof typeof statusMap;
            return statusMap[status];
        } catch (e) {
            containerLogger.error(`Failed to get status of docker container ${e}'`);
            return ContainerStatus.UNKNOWN;
        }
    }

    async exists(): Promise<boolean> {
        const args = ["ps", "-a", "--filter", `name=${this.containerName}`, "--format", "{{.Names}}"];
        const sp = dockerSpawn(args);
        try {
            const { stdout: exists } = await execFileAsync(sp.file, sp.args);
            return exists.includes("WinBoat");
        } catch (e) {
            containerLogger.error(
                `Failed to get container status, is ${capitalizeFirstLetter(this.executableAlias)} installed?`,
            );
            containerLogger.error(e);
            return false;
        }
    }

    get containerName(): string {
        return this.defaultCompose.services.windows.container_name; // TODO: investigate whether we should use the compose on disk
    }

    static override async _getSpecs(): Promise<DockerSpecs> {
        let specs: DockerSpecs = {
            dockerInstalled: false,
            dockerComposeInstalled: false,
            dockerIsRunning: false,
            dockerIsInUserGroups: false,
        };

        try {
            const sp = dockerSpawn(["--version"]);
            const { stdout: dockerOutput } = await execFileAsync(sp.file, sp.args);
            specs.dockerInstalled = !!dockerOutput;
        } catch (e) {
            console.error("Error checking for Docker installation:", e);
        }

        // Docker Compose plugin check with version validation
        try {
            const sp = dockerSpawn(["compose", "version"]);
            const { stdout: dockerComposeOutput } = await execFileAsync(sp.file, sp.args);
            if (dockerComposeOutput) {
                // Example output: "Docker Compose version v2.35.1"
                // Example output 2: "Docker Compose version 2.36.2"
                const versionMatch = /(\d+\.\d+\.\d+)/.exec(dockerComposeOutput);
                if (versionMatch) {
                    const majorVersion = Number.parseInt(versionMatch[1].split(".")[0], 10);
                    specs.dockerComposeInstalled = majorVersion >= 2;
                } else {
                    specs.dockerComposeInstalled = false; // No valid version found
                }
            } else {
                specs.dockerComposeInstalled = false; // No output, plugin not installed
            }
        } catch (e) {
            console.error("Error checking Docker Compose version:", e);
        }

        // Docker is running check
        try {
            const sp = dockerSpawn(["ps"]);
            const { stdout: dockerOutput } = await execFileAsync(sp.file, sp.args);
            specs.dockerIsRunning = !!dockerOutput;
        } catch (e) {
            console.error("Error checking if Docker is running:", e);
        }

        // Docker user group check (host groups when running as Flatpak)
        try {
            const sp = hostExec("id", ["-Gn"]);
            const { stdout: userGroups } = await execFileAsync(sp.file, sp.args);
            specs.dockerIsInUserGroups = userGroups.split(/\s+/).includes("docker");
        } catch (e) {
            console.error("Error checking user groups for docker:", e);
        }

        return specs;
    }
}
