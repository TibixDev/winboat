import { DOCKER_DEFAULT_COMPOSE } from "../../data/docker";
import { WINBOAT_DIR } from "../constants";
import { ComposeDirection } from "./container";
import { execFileAsync } from "../exec-helper";
import { SharedContainerManagerBehaviour } from "./shared";

const path: typeof import("path") = require("path");
const fs: typeof import("fs") = require("fs");

export type DockerSpecs = {
    dockerInstalled: boolean;
    dockerComposeInstalled: boolean;
    dockerIsRunning: boolean;
    dockerIsInUserGroups: boolean;
};

// TODO: We probably need to separate these into their respective files.
export class DockerContainer extends SharedContainerManagerBehaviour {
    defaultCompose = DOCKER_DEFAULT_COMPOSE;
    composeFilePath = path.join(WINBOAT_DIR, "docker-compose.yml"); // TODO: If/when we support multiple VM's we need to put this in the constructor
    executableAlias = "docker";

    constructor() {
        super();
    }
    compose(direction: ComposeDirection): Promise<void> {
        return super.compose_base(direction);
    }

    static override async _getSpecs(): Promise<DockerSpecs> {
        let specs: DockerSpecs = {
            dockerInstalled: false,
            dockerComposeInstalled: false,
            dockerIsRunning: false,
            dockerIsInUserGroups: false,
        };

        try {
            const { stdout: dockerOutput } = await execFileAsync("docker", ["--version"]);
            specs.dockerInstalled = !!dockerOutput;
        } catch (e) {
            console.error("Error checking for Docker installation:", e);
        }

        // Docker Compose plugin check with version validation
        try {
            const { stdout: dockerComposeOutput } = await execFileAsync("docker", ["compose", "version"]);
            if (dockerComposeOutput) {
                // Example output: "Docker Compose version v2.35.1"
                // Example output 2: "Docker Compose version 2.36.2"
                const versionMatch = dockerComposeOutput.match(/(\d+\.\d+\.\d+)/);
                if (versionMatch) {
                    const majorVersion = parseInt(versionMatch[1].split(".")[0], 10);
                    specs.dockerComposeInstalled = majorVersion >= 2;
                } else {
                    specs.dockerComposeInstalled = false; // No valid version found
                }
            } else {
                specs.dockerComposeInstalled = false; // No output, plugin not installed
            }
        } catch (e) {
            console.error("Error checking Docker Compose version:", e);
        }

        // Docker is running check
        try {
            const { stdout: dockerOutput } = await execFileAsync("docker", ["ps"]);
            specs.dockerIsRunning = !!dockerOutput;
        } catch (e) {
            console.error("Error checking if Docker is running:", e);
        }

        // Docker user group check
        try {
            const { stdout: userGroups } = await execFileAsync("id", ["-Gn"]);
            specs.dockerIsInUserGroups = userGroups.split(/\s+/).includes("docker");
        } catch (e) {
            console.error("Error checking user groups for docker:", e);
        }

        return specs;
    }
}
