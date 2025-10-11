import { ComposeConfig } from "../../types";
import { RESTART_ON_FAILURE, WINBOAT_DIR } from "./constants";
import { DOCKER_DEFAULT_COMPOSE } from "../data/docker";
import { createLogger } from "../utils/log";
import YAML from "json-to-pretty-yaml";
const fs: typeof import('fs') = require('fs');
const path: typeof import('path') = require('path');
const { promisify }: typeof import('util') = require('util');
const { exec }: typeof import('child_process') = require('child_process');

const execAsync = promisify(exec);
const logger = createLogger(path.join(WINBOAT_DIR, 'container.log'));

type ComposeDirection = "up" | "down";

export abstract class Container {
    abstract readonly defaultCompose: ComposeConfig;
    abstract readonly composeFilePath: string;
    abstract readonly executableAlias: string;

    abstract writeCompose(compose: ComposeConfig): void;
    abstract compose(direction: ComposeDirection): Promise<void>;
}

export class DockerContainer extends Container {
    defaultCompose = DOCKER_DEFAULT_COMPOSE;
    composeFilePath = path.join(WINBOAT_DIR, "docker-compose.yml"); // TODO: If/when we support multiple VM's we need to put this in the constructor
    executableAlias = "docker";

    constructor() {
        super();
    }

    writeCompose(compose: ComposeConfig): void {
        const composeContent = YAML.stringify(this.defaultCompose);
        fs.writeFileSync(this.composeFilePath, composeContent, { encoding: "utf-8" });

        logger.info(`Wrote to compose file at: ${this.composeFilePath}`);
        logger.info(`Compose file content: ${JSON.stringify(composeContent, null, 2)}`);
    }

    async compose(direction: ComposeDirection): Promise<void> {
        const extraArguments = direction == "up" ? "-d" : ""; // Run compose in detached mode if we are running compose up
        const command = `${this.executableAlias} compose -f ${this.composeFilePath} ${direction} ${extraArguments}`;

        try {
            const { stdout, stderr } = await execAsync(command);
            if (stderr) {
                logger.error(stderr);
            }
        } catch (e) {
            logger.error(`Failed to run compose command '${command}'`);
            logger.error(e);
            throw e;
        }
    }
}