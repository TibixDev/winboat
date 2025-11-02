import { PODMAN_DEFAULT_COMPOSE } from "../../data/podman";
import { WINBOAT_DIR } from "../constants";
import { ComposeDirection, containerLogger } from "./container";
import { ComposePortEntry } from "../../utils/port";
import { SharedContainerManagerBehaviour } from "./shared";
import { concatEnv, execFileAsync } from "../exec-helper";

const path: typeof import("path") = require("path");

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

const COMPOSE_ENV_VARS = { PODMAN_COMPOSE_PROVIDER: "podman-compose", PODMAN_COMPOSE_WARNING_LOGS: "false" };

export class PodmanContainer extends SharedContainerManagerBehaviour {
    defaultCompose = PODMAN_DEFAULT_COMPOSE;
    composeFilePath = path.join(WINBOAT_DIR, "podman-compose.yml");
    executableAlias = "podman";

    cachedPortMappings: ComposePortEntry[] | null = null;

    constructor() {
        super();
    }

    async compose(direction: ComposeDirection): Promise<void> {
        return this.compose_base(direction, COMPOSE_ENV_VARS);
    }

    static override async _getSpecs(): Promise<PodmanSpecs> {
        let specs: PodmanSpecs = {
            podmanInstalled: false,
            podmanComposeInstalled: false,
        };

        try {
            const { stdout: podmanOutput } = await execFileAsync("podman", ["--version"]);
            specs.podmanInstalled = !!podmanOutput;
        } catch (e) {
            containerLogger.error("Error checking podman version");
        }

        try {
            const { stdout: podmanComposeOutput } = await execFileAsync("podman", ["compose", "--version"], {
                env: concatEnv(process.env as { [key: string]: string }, COMPOSE_ENV_VARS),
            });
            specs.podmanComposeInstalled = !!podmanComposeOutput;
        } catch (e) {
            containerLogger.error("Error checking podman compose version");
        }

        return specs;
    }
}
