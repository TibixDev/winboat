import { ComposeDirection, ContainerAction, containerLogger, ContainerManager, ContainerStatus } from "./container";
import { ComposePortEntry } from "../../utils/port";
import { ComposeConfig } from "../../../types";
import YAML from "yaml";
import { concatEnv, execFileAsync, stringifyExecFile } from "../exec-helper";
import { capitalizeFirstLetter } from "../../utils/capitalize";

const fs: typeof import("fs") = require("fs");

export abstract class SharedContainerManagerBehaviour extends ContainerManager {
    cachedPortMappings: ComposePortEntry[] | null = null;

    writeCompose(compose: ComposeConfig): void {
        const composeContent = YAML.stringify(compose, { nullStr: "" });
        fs.writeFileSync(this.composeFilePath, composeContent, { encoding: "utf-8" });

        containerLogger.info(`Wrote to compose file at: ${this.composeFilePath}`);
        containerLogger.info(`Compose file content: ${JSON.stringify(composeContent, null, 2)}`);
    }

    protected async compose_base(direction: ComposeDirection, envArgs?: { [key: string]: string }): Promise<void> {
        const args = ["compose", "-f", this.composeFilePath, direction];
        if (direction === "up") {
            // Run compose in detached mode if we are running compose up TODO: maybe we need to run both in detached mode
            args.push("-d");
        }
        try {
            const { stderr } = await execFileAsync(this.executableAlias, args, {
                env: concatEnv(process.env as { [key: string]: string }, envArgs),
            });
            if (stderr) {
                containerLogger.error(stderr);
            }
        } catch (e) {
            containerLogger.error(`Failed to run compose command '${stringifyExecFile(this.executableAlias, args)}'`);
            containerLogger.error(e);
            throw e;
        }
    }

    async container(action: ContainerAction): Promise<void> {
        const args = ["container", action, this.containerName];
        try {
            const { stdout } = await execFileAsync(this.executableAlias, args);
            containerLogger.info(`Container action '${action}' response: '${stdout}'`);
        } catch (e) {
            containerLogger.error(`Failed to run container action '${stringifyExecFile(this.executableAlias, args)}'`);
            containerLogger.error(e);
            throw e;
        }
    }

    async port(): Promise<ComposePortEntry[]> {
        const args = ["port", this.containerName];
        const ret = [];

        try {
            const { stdout } = await execFileAsync(this.executableAlias, args);

            for (const line of stdout.trim().split("\n")) {
                const parts = line.split("->").map(part => part.trim());
                const hostPart = parts[1];
                const containerPart = parts[0];

                ret.push(new ComposePortEntry(`${hostPart}:${containerPart}`));
            }
        } catch (e) {
            containerLogger.error(`Failed to run container action '${stringifyExecFile(this.executableAlias, args)}'`);
            containerLogger.error(e);
            throw e;
        }

        containerLogger.info("Podman container active port mappings: ", JSON.stringify(ret));
        this.cachedPortMappings = ret;
        return ret;
    }

    async remove(): Promise<void> {
        const args = ["rm", this.containerName];

        try {
            const { stdout } = await execFileAsync(this.executableAlias, args);
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
        const args = ["inspect", "--format={{.State.Status}}", this.containerName];
        try {
            const { stdout } = await execFileAsync(this.executableAlias, args);
            const status = stdout.trim() as keyof typeof statusMap;
            return statusMap[status];
        } catch (e) {
            containerLogger.error(`Failed to get status of docker container ${e}'`);
            return ContainerStatus.UNKNOWN;
        }
    }

    async exists(): Promise<boolean> {
        const args = ["ps", "-a", "--filter", `name=${this.containerName}`, "--format", "{{.Names}}"];
        try {
            const { stdout: exists } = await execFileAsync(this.executableAlias, args);
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
}
