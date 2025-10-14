import { ComposeConfig } from "../../../types";
import { PODMAN_DEFAULT_COMPOSE } from "../../data/podman";
import { WINBOAT_DIR } from "../constants";
import { ComposeDirection, containerLogger, ContainerManager, ContainerStatus } from "./container";
import YAML from "json-to-pretty-yaml";
const { execSync }: typeof import('child_process') = require('child_process');
const path: typeof import('path') = require('path');
const fs: typeof import('fs') = require('fs');

export type PodmanSpecs = {
    podmanInstalled: boolean;
    podmanComposeInstalled: boolean;
}

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
        const composeContent = YAML.stringify(this.defaultCompose);
        fs.writeFileSync(this.composeFilePath, composeContent, { encoding: "utf-8" });

        containerLogger.info(`Wrote to compose file at: ${this.composeFilePath}`);
        containerLogger.info(`Compose file content: ${JSON.stringify(composeContent, null, 2)}`);
    }

    async compose(direction: ComposeDirection): Promise<void> {
        containerLogger.error("NOT IMPLEMENTED");
    }

    get status(): ContainerStatus {
        const statusMap = {
            "created": ContainerStatus.CREATED,
            "exited": ContainerStatus.EXITED,
            "paused": ContainerStatus.PAUSED,
            "running": ContainerStatus.RUNNING,
            "unknown": ContainerStatus.UKNOWN
        } as const;
        const command = `${this.executableAlias} inspect --format "{{.State.Status}} ${this.defaultCompose.services.windows.container_name}"`;
        try {
            const status = execSync(command).toString().trim() as keyof typeof statusMap;
            return statusMap[status];
        } catch(e) {
            containerLogger.error(`Failed to get status of podman container ${this.defaultCompose.name}.\nCommand '${command} failed:'`);
            containerLogger.error(e);
            return ContainerStatus.UKNOWN;
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
            const podmanComposeOutput = execSync("podman compose --version");
            specs.podmanComposeInstalled = !!podmanComposeOutput;
        } catch(e) {
            containerLogger.error("Error checking podman compose version");
        }

        return specs;
    }
}