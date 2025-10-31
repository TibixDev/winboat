import { ComposeConfig } from "../../../types";
import { DOCKER_DEFAULT_COMPOSE } from "../../data/docker";
import { capitalizeFirstLetter } from "../../utils/capitalize";
import { ComposePortEntry } from "../../utils/port";
import { WINBOAT_DIR } from "../constants";
import { ComposeDirection, ContainerAction, containerLogger, ContainerManager, ContainerStatus } from "./container";
import YAML from "yaml";
const { exec }: typeof import("child_process") = require("child_process");
const { promisify }: typeof import("util") = require("util");
const path: typeof import("path") = require("path");
const fs: typeof import("fs") = require("fs");

const execAsync = promisify(exec);

export type DockerSpecs = {
    dockerInstalled: boolean;
    dockerComposeInstalled: boolean;
    dockerIsRunning: boolean;
    dockerIsInUserGroups: boolean;
};

// TODO: We probably need to separate these into their respective files.
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

    async compose(direction: ComposeDirection): Promise<void> {
        const extraArguments = direction == "up" ? "-d" : ""; // Run compose in detached mode if we are running compose up TODO: maybe we need to run both in detached mode
        const command = `${this.executableAlias} compose -f ${this.composeFilePath} ${direction} ${extraArguments}`;

        try {
            const { stdout, stderr } = await execAsync(command);
            if (stderr) {
                containerLogger.error(stderr);
            }
        } catch (e) {
            containerLogger.error(`Failed to run compose command '${command}'`);
            containerLogger.error(e);
            throw e;
        }
    }

    async container(action: ContainerAction): Promise<void> {
        const command = `${this.executableAlias} container ${action} ${this.containerName}`;

        try {
            const { stdout } = await execAsync(command);
            containerLogger.info(`Container action '${action}' response: '${stdout}'`);
        } catch (e) {
            containerLogger.error(`Failed to run container action '${command}'`);
            containerLogger.error(e);
            throw e;
        }
    }

    async port(): Promise<ComposePortEntry[]> {
        const command = `${this.executableAlias} port ${this.containerName}`;
        const ret = [];

        try {
            const { stdout } = await execAsync(command);

            for (const line of stdout.trim().split("\n")) {
                const parts = line.split("->").map(part => part.trim());
                const hostPart = parts[1];
                const containerPart = parts[0];

                ret.push(new ComposePortEntry(`${hostPart}:${containerPart}`));
            }
        } catch (e) {
            containerLogger.error(`Failed to run container action '${command}'`);
            containerLogger.error(e);
            throw e;
        }

        containerLogger.info("Podman container active port mappings: ", JSON.stringify(ret));
        this.cachedPortMappings = ret;
        return ret;
    }

    async remove(): Promise<void> {
        const command = `${this.executableAlias} rm ${this.containerName}`;

        try {
            const { stdout } = await execAsync(command);
        } catch (e) {
            containerLogger.error(`Failed to remove container '${this.containerName}'`);
            containerLogger.error(e);
        }
    }

    async getStatus(): Promise<ContainerStatus> {
        const statusMap = {
            created: ContainerStatus.CREATED,
            restarting: ContainerStatus.UNKNOWN,
            running: ContainerStatus.RUNNING,
            paused: ContainerStatus.PAUSED,
            exited: ContainerStatus.EXITED,
            dead: ContainerStatus.UNKNOWN,
        } as const;
        const command = `${this.executableAlias} inspect --format="{{.State.Status}}" ${this.containerName}`;

        try {
            const { stdout } = await execAsync(command);
            const status = stdout.trim() as keyof typeof statusMap;
            return statusMap[status];
        } catch (e) {
            containerLogger.error(`Failed to get status of docker container ${e}'`);
            return ContainerStatus.UNKNOWN;
        }
    }

    async exists(): Promise<boolean> {
        const command = `${this.executableAlias} ps -a --filter "name=${this.containerName}" --format "{{.Names}}"`;

        try {
            const { stdout: exists } = await execAsync(command);
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
            const { stdout: dockerOutput } = await execAsync("docker --version");
            specs.dockerInstalled = !!dockerOutput;
        } catch (e) {
            console.error("Error checking for Docker installation:", e);
        }

        // Docker Compose plugin check with version validation
        try {
            const { stdout: dockerComposeOutput } = await execAsync("docker compose version");
            if (dockerComposeOutput) {
                // Example output: "Docker Compose version v2.35.1"
                // Example output 2: "Docker Compose version 2.36.2"
                const versionMatch = dockerComposeOutput.match(/(\d+\.\d+\.\d+)/);
                if (versionMatch) {
                    const majorVersion = parseInt(versionMatch[1].split(".")[0], 10);
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
            const { stdout: dockerOutput } = await execAsync("docker ps");
            specs.dockerIsRunning = !!dockerOutput;
        } catch (e) {
            console.error("Error checking if Docker is running:", e);
        }

        // Docker user group check
        try {
            const { stdout: userGroups } = await execAsync("id -Gn");
            specs.dockerIsInUserGroups = userGroups.split(/\s+/).includes("docker");
        } catch (e) {
            console.error("Error checking user groups for docker:", e);
        }

        return specs;
    }
}
