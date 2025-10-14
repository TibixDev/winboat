import { ComposeConfig } from "../../../types";
import { DOCKER_DEFAULT_COMPOSE } from "../../data/docker";
import { WINBOAT_DIR } from "../constants";
import { ComposeDirection, containerLogger, ContainerManager } from "./container";
import YAML from "json-to-pretty-yaml";
const { execSync }: typeof import('child_process') = require('child_process');
const { exec }: typeof import('child_process') = require('child_process');
const { promisify }: typeof import('util') = require('util');
const path: typeof import('path') = require('path');
const fs: typeof import('fs') = require('fs');

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
}