import { ComposeConfig } from "../../types";
import { RESTART_ON_FAILURE, WINBOAT_DIR } from "./constants";
import { DOCKER_DEFAULT_COMPOSE } from "../data/docker";
import { createLogger } from "../utils/log";
import YAML from "json-to-pretty-yaml";
import { PODMAN_DEFAULT_COMPOSE } from "../data/podman";
import { contextId } from "process";
const fs: typeof import('fs') = require('fs');
const path: typeof import('path') = require('path');
const { exec }: typeof import('child_process') = require('child_process');
const { promisify }: typeof import('util') = require('util');
const { execSync }: typeof import('child_process') = require('child_process');

const execAsync = promisify(exec);
const logger = createLogger(path.join(WINBOAT_DIR, 'container.log'));

type ComposeDirection = "up" | "down";

export abstract class ContainerManager {
    abstract readonly defaultCompose: ComposeConfig;
    abstract readonly composeFilePath: string;
    abstract readonly executableAlias: string;

    abstract writeCompose(compose: ComposeConfig): void;
    abstract compose(direction: ComposeDirection): Promise<void>;

    // static "abstract" function
    static _getSpecs(): ContainerSpecs[ContainerRuntimes] {
        throw new Error("Can't get specs of abstract class ContainerManager");
    }

    // I shouldn't put these functions here.
    static getSpecs<T extends ContainerRuntimes>(type: T): ContainerSpecs[T] {
        return ContainerImplementations[type]._getSpecs() as ContainerSpecs[T];
    }

    static createContainer<T extends ContainerRuntimes>(type: T, ...params: ConstructorParameters<typeof ContainerImplementations[T]>) {
        return new ContainerImplementations[type](...(params as []));
    }
}

// TODO: We probably need to separate these into their respective files.
export class DockerContainer extends ContainerManager {
    defaultCompose = DOCKER_DEFAULT_COMPOSE;
    composeFilePath = path.join(WINBOAT_DIR, "docker-compose.yml"); // TODO: If/when we support multiple VM's we need to put this in the constructor
    executableAlias = "docker";

    constructor() {
        super();
    }

    static override _getSpecs(): DockerSpecs  {
        let specs: DockerSpecs = {
            dockerInstalled: false,
            dockerComposeInstalled: false,
            dockerIsRunning: false,
            dockerIsInUserGroups: false
        };
        
        try {
            const dockerOutput = execSync('docker --version');
            specs.dockerInstalled = !!dockerOutput;
        } catch (e) {
            console.error('Error checking for Docker installation:', e);
        }
    
        // Docker Compose plugin check with version validation
        try {
            const dockerComposeOutput = execSync('docker compose version').toString();
            if (dockerComposeOutput) {
                // Example output: "Docker Compose version v2.35.1"
                // Example output 2: "Docker Compose version 2.36.2"
                const versionMatch = dockerComposeOutput.match(/(\d+\.\d+\.\d+)/);
                if (versionMatch) {
                    const majorVersion = parseInt(versionMatch[1].split('.')[0], 10);
                    specs.dockerComposeInstalled = majorVersion >= 2;
                } else {
                    specs.dockerComposeInstalled = false; // No valid version found
                }
            } else {
                specs.dockerComposeInstalled = false; // No output, plugin not installed
            }
        } catch (e) {
            console.error('Error checking Docker Compose version:', e);
        }
    
        // Docker is running check
        try {
            const dockerOutput = execSync('docker ps');
            specs.dockerIsRunning = !!dockerOutput;
        } catch (e) {
            console.error('Error checking if Docker is running:', e);
        }
    
        // Docker user group check
        try {
            const userGroups = execSync('id -Gn').toString();
            specs.dockerIsInUserGroups = userGroups.split(/\s+/).includes('docker');
        } catch (e) {
            console.error('Error checking user groups for docker:', e);
        }

        return specs;
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
            logger.error("Error checking podman version");
        }

        try {
            const podmanComposeOutput = execSync("podman compose --version");
            specs.podmanComposeInstalled = !!podmanComposeOutput;
        } catch(e) {
            logger.error("Error checking podman compose version");
        }

        return specs;
    }

    writeCompose(compose: ComposeConfig): void {
        logger.error("NOT IMPLEMENTED");
    }

    async compose(direction: ComposeDirection): Promise<void> {
        logger.error("NOT IMPLEMENTED");
    }
}

export enum ContainerRuntimes {
    DOCKER = "Docker",
    PODMAN = "Podman",
};

export type DockerSpecs = {
    dockerInstalled: boolean;
    dockerComposeInstalled: boolean;
    dockerIsRunning: boolean;
    dockerIsInUserGroups: boolean;
};

export type PodmanSpecs = {
    podmanInstalled: boolean;
    podmanComposeInstalled: boolean;
}

type ContainerSpecs = {
    [ContainerRuntimes.DOCKER]: DockerSpecs
    [ContainerRuntimes.PODMAN]: PodmanSpecs
};

export const ContainerImplementations = {
    [ContainerRuntimes.DOCKER]: DockerContainer,
    [ContainerRuntimes.PODMAN]: PodmanContainer,
} as const satisfies Record<ContainerRuntimes, any>; // this makes it so ContainerImplementations has to map ContainerRuntimes to something exhaustively

const test = ContainerManager.getSpecs(ContainerRuntimes.DOCKER);