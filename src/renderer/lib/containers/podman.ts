import { ComposeConfig } from "../../../types";
import { PODMAN_DEFAULT_COMPOSE } from "../../data/podman";
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
import { capitalizeFirstLetter } from "../../utils/capitalize";
import { concatEnv, execFileAsync, stringifyExecFile } from "../exec-helper";
import {
    preflightExistingPodmanContainer,
    preflightPodmanArchitecture,
    type PodmanExec,
} from "./podman-architecture-preflight";

const path: typeof import("node:path") = require("node:path");
const fs: typeof import("node:fs") = require("node:fs");
const process: typeof import("process") = require("node:process");

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

export type PodmanCommand = (
    args: string[],
    options?: { env?: Record<string, string> },
) => Promise<{ stdout: string; stderr: string }>;

const defaultPodmanCommand: PodmanCommand = async (args, options) => {
    const { stdout, stderr } = await execFileAsync("podman", args, options);
    return {
        stdout: typeof stdout === "string" ? stdout : (stdout?.toString("utf8") ?? ""),
        stderr: typeof stderr === "string" ? stderr : (stderr?.toString("utf8") ?? ""),
    };
};

export class PodmanContainer extends ContainerManager {
    defaultCompose = PODMAN_DEFAULT_COMPOSE;
    composeFilePath = path.join(WINBOAT_DIR, "podman-compose.yml");
    executableAlias = "podman";

    constructor(
        private readonly runCommand: PodmanCommand = defaultPodmanCommand,
        private readonly nodeArchitecture: NodeJS.Architecture = process.arch,
    ) {
        super();
    }

    writeCompose(compose: ComposeConfig): void {
        const composeContent = YAML.stringify(compose, {
            nullStr: "",
            defaultStringType: "QUOTE_DOUBLE",
            defaultKeyType: "PLAIN",
        });
        fs.writeFileSync(this.composeFilePath, composeContent, { encoding: "utf-8" });

        containerLogger.info(`Wrote to compose file at: ${this.composeFilePath}`);
    }

    async preflight(compose?: ComposeConfig, includeExistingContainer = false): Promise<void> {
        const config =
            compose ?? (YAML.parse(fs.readFileSync(this.composeFilePath, "utf8")) as ComposeConfig);
        const run: PodmanExec = async args => (await this.runCommand([...args])).stdout;
        await preflightPodmanArchitecture(config, this.nodeArchitecture, run);
        if (includeExistingContainer) {
            await preflightExistingPodmanContainer(this.containerName, this.nodeArchitecture, run);
        }
    }

    async compose(direction: ComposeDirection, extraArgs: ComposeArguments[] = []): Promise<void> {
        let args = ["compose", "-f", this.composeFilePath, direction, ...extraArgs];
        let composeSucceeded = false;

        try {
            if (direction === "up") {
                await this.preflight();
                if (!extraArgs.includes("--no-start")) args.push("-d");
            }
            const { stderr } = await this.runCommand(args, {
                env: concatEnv(process.env as { [key: string]: string }, COMPOSE_ENV_VARS),
            });
            composeSucceeded = true;
            if (stderr) {
                containerLogger.error(stderr);
            }
            // Rootless Podman host port publish never hits dockur QEMU_DNAT PREROUTING.
            // Ensure userspace TCP/UDP listeners forward API/RDP into the guest.
            // Failures throw RootlessPortForwardError (container is left running).
            const { ensureRootlessForwardsIfNeeded, shouldRecoverForwardsOnCompose } =
                await import("./rootless-port-forward");
            if (shouldRecoverForwardsOnCompose(direction) && !extraArgs.includes("--no-start")) {
                await ensureRootlessForwardsIfNeeded(this.containerName, { fatalOnError: true });
            }
        } catch (e) {
            if (composeSucceeded) {
                containerLogger.error("Compose completed, but rootless guest port forward recovery failed");
            } else {
                containerLogger.error(`Failed to run compose command '${stringifyExecFile(this.executableAlias, args)}'`);
            }
            containerLogger.error(e);
            throw e;
        }
    }

    async container(action: ContainerAction): Promise<void> {
        const args = ["container", action, this.containerName];
        try {
            if (action === "start" || action === "restart" || action === "unpause") {
                await this.preflight(undefined, true);
            }
            const { stdout } = await this.runCommand(args);
            containerLogger.info(`Container action '${action}' response: '${stdout}'`);
            // Children inside the container die on stop/restart/reboot; re-arm forwarders.
            const { ensureRootlessForwardsIfNeeded, shouldRecoverForwardsOnContainerAction } =
                await import("./rootless-port-forward");
            if (shouldRecoverForwardsOnContainerAction(action)) {
                await ensureRootlessForwardsIfNeeded(this.containerName, { fatalOnError: true });
            }
        } catch (e) {
            containerLogger.error(`Failed to run container action '${stringifyExecFile(this.executableAlias, args)}'`);
            containerLogger.error(e);
            throw e;
        }
    }

    async remove(): Promise<void> {
        const args = ["rm", this.containerName];

        try {
            await this.runCommand(args);
        } catch (e) {
            containerLogger.error(`Failed to remove container '${this.containerName}'`);
            containerLogger.error(e);
        }
    }

    async getStatus(): Promise<ContainerStatus> {
        const statusMap = {
            created: ContainerStatus.CREATED,
            restarting: ContainerStatus.UNKNOWN,
            initialized: ContainerStatus.UNKNOWN,
            removing: ContainerStatus.UNKNOWN,
            stopping: ContainerStatus.EXITED,
            stopped: ContainerStatus.EXITED,
            running: ContainerStatus.RUNNING,
            paused: ContainerStatus.PAUSED,
            exited: ContainerStatus.EXITED,
            dead: ContainerStatus.UNKNOWN,
        } as const;
        const args = ["inspect", "--format={{.State.Status}}", this.containerName];

        try {
            const { stdout } = await this.runCommand(args);
            const status = stdout.trim() as keyof typeof statusMap;
            return statusMap[status];
        } catch (e) {
            containerLogger.error(`Failed to get status of podman container ${e}'`);
            return ContainerStatus.UNKNOWN;
        }
    }

    async exists(): Promise<boolean> {
        const args = [
            "ps",
            "-a",
            "--filter",
            `name=${this.containerName}`,
            "--format",
            "{{.Names}}",
        ];
        try {
            const { stdout: exists } = await this.runCommand(args);
            return exists.includes(this.containerName);
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
            const { stdout: podmanOutput } = await execFileAsync("podman", ["--version"]);
            specs.podmanInstalled = !!podmanOutput;
        } catch (e) {
            containerLogger.error("Error checking podman version");
            containerLogger.error(e);
        }

        try {
            const { stdout: podmanComposeOutput } = await execFileAsync("podman", ["compose", "--version"], {
                env: concatEnv(process.env as { [key: string]: string }, COMPOSE_ENV_VARS),
            });
            specs.podmanComposeInstalled = !!podmanComposeOutput;
        } catch (e) {
            containerLogger.error("Error checking podman compose version");
            containerLogger.error(e);
        }

        return specs;
    }
}
