import { ComposeConfig } from "../../../types";
import { PODMAN_DEFAULT_COMPOSE } from "../../data/podman";
import { WINBOAT_DIR } from "../constants";
import { ComposeDirection, containerLogger, ContainerManager } from "./container";
const { execSync }: typeof import('child_process') = require('child_process');
const path: typeof import('path') = require('path');

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

    writeCompose(compose: ComposeConfig): void {
        containerLogger.error("NOT IMPLEMENTED");
    }

    async compose(direction: ComposeDirection): Promise<void> {
        containerLogger.error("NOT IMPLEMENTED");
    }
}