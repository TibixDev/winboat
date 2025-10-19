import { ComposeConfig } from "../../../types";
import { PODMAN_DEFAULT_COMPOSE } from "../../data/podman";
import { WINBOAT_DIR } from "../constants";
import { ComposeDirection, containerLogger, ContainerManager, ContainerStatus, ContainerAction } from "./container";
import YAML from 'yaml';
import { stringify } from "json-to-pretty-yaml";
import { capitalizeFirstLetter } from "../../utils/capitalize";
const { execSync }: typeof import('child_process') = require('child_process'); // TODO: migrate to execAsync
const { exec }: typeof import('child_process') = require('child_process');
const { promisify }: typeof import('util') = require('util');
const path: typeof import('path') = require('path');
const fs: typeof import('fs') = require('fs');

const execAsync = promisify(exec);

export type PodmanSpecs = {
    podmanInstalled: boolean;
    podmanComposeInstalled: boolean;

}

export enum PodmanAPIStatus {
    AVAILABLE = "Available",
    UNAVAILABLE = "Unavailable"
};

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

/**
 * @todo NOT IMPLEMENTED
 */
export class PodmanContainer extends ContainerManager {
    defaultCompose = PODMAN_DEFAULT_COMPOSE;
    composeFilePath = path.join(WINBOAT_DIR, "podman-compose.yml");
    executableAlias = "podman";

    constructor() {
        super();
    }

    writeCompose(compose: ComposeConfig): void {
        const composeContent = stringify(this.defaultCompose);
        fs.writeFileSync(this.composeFilePath, composeContent, { encoding: "utf-8" });

        containerLogger.info(`Wrote to compose file at: ${this.composeFilePath}`);
        containerLogger.info(`Compose file content: ${JSON.stringify(composeContent, null, 2)}`);
    }

    async compose(direction: ComposeDirection): Promise<void> {
        const extraArguments = direction == "up" ? "-d" : ""; // Run compose in detached mode if we are running compose up TODO: maybe we need to run both in detached mode
        const command = `PODMAN_COMPOSE_PROVIDER=podman-compose ${this.executableAlias} compose -f ${this.composeFilePath} ${direction} ${extraArguments}`;

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
        const command = `${this.executableAlias} container ${action} ${this.defaultCompose.services.windows.container_name}`;
        
        try {
            const { stdout } = await execAsync(command);
            containerLogger.info(`Container action '${action}' response: '${stdout}'`);
        }
        catch(e) {
            containerLogger.error(`Failed to run container action '${command}'`);
            containerLogger.error(e);
            throw e;
        }
    }

    get status(): ContainerStatus {
        const statusMap = {
            "created": ContainerStatus.CREATED,
            "exited": ContainerStatus.EXITED,
            "paused": ContainerStatus.PAUSED,
            "running": ContainerStatus.RUNNING,
            "stopping": ContainerStatus.EXITED, // TODO: investigate this status value
            "unknown": ContainerStatus.UKNOWN
        } as const;
        const command = `${this.executableAlias} inspect --format "{{.State.Status}}" ${this.defaultCompose.services.windows.container_name}`;

        try {
            const status = execSync(command).toString().trim() as keyof typeof statusMap;
            return statusMap[status];
        } catch(e) {
            containerLogger.error(`Failed to get status of podman container ${e}:'`);
            return ContainerStatus.UKNOWN;
        }
    }

    get exists(): boolean {
        const command = `${this.executableAlias} ps -a --filter "name=${this.defaultCompose.services.windows.container_name}" --format "{{.Names}}"`

        try {
            const exists = execSync(command).toString();
            return exists.includes('WinBoat');
        } catch(e) {
            containerLogger.error(`Failed to get container status, is ${capitalizeFirstLetter(this.executableAlias)} installed?`);
            containerLogger.error(e);
            return false;
        }
    }

    static override _getSpecs(): PodmanSpecs {
        let specs: PodmanSpecs = {
            podmanInstalled: false,
            podmanComposeInstalled: false
        };

        try {
            const podmanOutput = execSync("podman --version");
            specs.podmanInstalled = !!podmanOutput;
        } catch(e) {
            containerLogger.error("Error checking podman version");
        }

        try {
            const podmanComposeOutput = execSync(`PODMAN_COMPOSE_PROVIDER=podman-compose podman compose --version`);
            specs.podmanComposeInstalled = !!podmanComposeOutput;
        } catch(e) {
            containerLogger.error("Error checking podman compose version");
        }

        return specs;
    }
}