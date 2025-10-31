import { ComposeConfig } from "../../../types";
import { PODMAN_DEFAULT_COMPOSE } from "../../data/podman";
import { WINBOAT_DIR } from "../constants";
import { ComposeDirection, containerLogger, ContainerManager, ContainerStatus, ContainerAction } from "./container";
import YAML from "yaml";
import { capitalizeFirstLetter } from "../../utils/capitalize";
import { ComposePortEntry } from "../../utils/port";
const { exec }: typeof import("child_process") = require("child_process");
const { promisify }: typeof import("util") = require("util");
const path: typeof import("path") = require("path");
const fs: typeof import("fs") = require("fs");

const execAsync = promisify(exec);

export type PodmanSpecs = {
    podmanInstalled: boolean;
    podmanComposeInstalled: boolean;
};

export enum PodmanAPIStatus {
    AVAILABLE = "Available",
    UNAVAILABLE = "Unavailable",
}

type PodmanInfo = {
    host: {
        remoteSocket: {
            exists: boolean;
            path: string;
        };
        [Key: string]: any;
    };
    plugins: object;
    registries: {
        search: string[];
    };
    store: object;
    version: object;
};

const COMPOSE_ENV_VARS = "PODMAN_COMPOSE_PROVIDER=podman-compose PODMAN_COMPOSE_WARNING_LOGS=false";

export class PodmanContainer extends ContainerManager {
    defaultCompose = PODMAN_DEFAULT_COMPOSE;
    composeFilePath = path.join(WINBOAT_DIR, "podman-compose.yml");
    executableAlias = "podman";

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
        const extraArguments = direction == "up" ? "-d" : ""; // Run compose in detached mode if we are running compose up
        const command = `${COMPOSE_ENV_VARS} ${this.executableAlias} compose -f ${this.composeFilePath} ${direction} ${extraArguments}`;

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
            await execAsync(command);
        } catch (e) {
            containerLogger.error(`Failed to remove container '${this.containerName}'`);
            containerLogger.error(e);
        }
    }

    async getStatus(): Promise<ContainerStatus> {
        const statusMap = {
            created: ContainerStatus.CREATED,
            exited: ContainerStatus.EXITED,
            paused: ContainerStatus.PAUSED,
            running: ContainerStatus.RUNNING,
            stopping: ContainerStatus.EXITED, // TODO: investigate this status value
            unknown: ContainerStatus.UNKNOWN,
        } as const;
        const command = `${this.executableAlias} inspect --format "{{.State.Status}}" ${this.containerName}`;

        try {
            const { stdout } = await execAsync(command);
            const status = stdout.trim() as keyof typeof statusMap;
            return statusMap[status];
        } catch (e) {
            containerLogger.error(`Failed to get status of podman container ${e}:'`);
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

    static override async _getSpecs(): Promise<PodmanSpecs> {
        let specs: PodmanSpecs = {
            podmanInstalled: false,
            podmanComposeInstalled: false,
        };

        try {
            const { stdout: podmanOutput } = await execAsync("podman --version");
            specs.podmanInstalled = !!podmanOutput;
        } catch (e) {
            containerLogger.error("Error checking podman version");
        }

        try {
            const { stdout: podmanComposeOutput } = await execAsync(`${COMPOSE_ENV_VARS} podman compose --version`);
            specs.podmanComposeInstalled = !!podmanComposeOutput;
        } catch (e) {
            containerLogger.error("Error checking podman compose version");
        }

        return specs;
    }
}
