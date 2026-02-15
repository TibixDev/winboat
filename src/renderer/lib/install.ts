import { type InstallConfiguration } from "../../types";
import { DOSBOAT_DIR, SHARED_DRIVE_INDEX_BY_LETTER, FREEDOS_BASE_IMAGE_FILES } from "./constants";
import { createLogger } from "../utils/log";
import { createNanoEvents, type Emitter } from "nanoevents";
import { Dosboat } from "./winboat";
import { ContainerManager } from "./containers/container";
import { DosboatConfig } from "./config";
import { CommonPorts, createContainer, getActiveHostPort } from "./containers/common";

const fs: typeof import("fs") = require("fs");
const path: typeof import("path") = require("path");
const nodeFetch: typeof import("node-fetch").default = require("node-fetch");
const remote: typeof import("@electron/remote") = require("@electron/remote");
const logger = createLogger(path.join(DOSBOAT_DIR, "install.log"));

export enum InstallStates {
    IDLE = "Preparing",
    CREATING_COMPOSE_FILE = "Creating Compose File",
    STARTING_CONTAINER = "Starting Container",
    MONITORING_PREINSTALL = "Monitoring Preinstall",
    INSTALLING_FREEDOS = "Installing FreeDOS",
    COMPLETED = "Completed",
    INSTALL_ERROR = "Install Error",
};

interface InstallEvents {
    stateChanged: (state: InstallStates) => void;
    preinstallMsg: (msg: string) => void;
    error: (error: Error) => void;
    vncPortChanged: (port: number) => void;
}

export class InstallManager {
    conf: InstallConfiguration;
    emitter: Emitter<InstallEvents>;
    state: InstallStates;
    preinstallMsg: string;
    container: ContainerManager;

    constructor(conf: InstallConfiguration) {
        this.conf = conf;
        this.state = InstallStates.IDLE;
        this.preinstallMsg = "";
        this.emitter = createNanoEvents<InstallEvents>();
        this.container = createContainer(conf.container);
    }

    changeState(newState: InstallStates) {
        this.state = newState;
        this.emitter.emit("stateChanged", newState);
        logger.info(`New state: "${newState}"`);
    }

    setPreinstallMsg(msg: string) {
        if (msg === this.preinstallMsg) return;
        this.preinstallMsg = msg;
        this.emitter.emit("preinstallMsg", msg);
        logger.info(`Preinstall: "${msg}"`);
    }

    sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    buildSharedDriveArg() {
        const letter = DosboatConfig.getInstance().config.sharedDriveLetter;
        const index = SHARED_DRIVE_INDEX_BY_LETTER[letter];
        return `-drive file=fat:rw:/shared,format=raw,if=ide,index=${index}`;
    }

    stripSharedDriveArg(args: string) {
        return args.replace(/\s*-drive file=fat:rw:\/shared,format=raw,if=ide,index=\d+/g, "").trim();
    }

    async createComposeFile() {
        this.changeState(InstallStates.CREATING_COMPOSE_FILE);

        // Ensure the .dosboat directory exists
        if (!fs.existsSync(DOSBOAT_DIR)) {
            fs.mkdirSync(DOSBOAT_DIR);
            logger.info(`Created DOSBoat directory: ${DOSBOAT_DIR}`);
        }

        // Ensure the installation directory exists
        if (!fs.existsSync(this.conf.installFolder)) {
            fs.mkdirSync(this.conf.installFolder, { recursive: true });
            logger.info(`Created installation directory: ${this.conf.installFolder}`);
        }

        // Configure the compose file
        const composeContent = this.container.defaultCompose;

        // Get app root path for resolving build context and image paths
        const appPath = remote.app.getAppPath();
        const isDev = !remote.app.isPackaged;
        const appRoot = isDev 
            ? path.join(appPath, "..", "..") // In dev: getAppPath() returns .../src/renderer, go up to project root
            : path.dirname(remote.process.resourcesPath); // In production: go to app root

        composeContent.services.freedos.environment.RAM_SIZE = `${this.conf.ramGB}G`;
        composeContent.services.freedos.environment.CPU_CORES = `${this.conf.cpuCores}`;
        composeContent.services.freedos.environment.DISK_SIZE = `${this.conf.diskSpaceGB}G`;
        composeContent.services.freedos.environment.VERSION = this.conf.freedosVersion;

        // Update build context to use absolute path
        if (composeContent.services.freedos.build) {
            composeContent.services.freedos.build.context = path.join(appRoot, "build", "freedos-image");
            logger.info(`Build context set to: ${composeContent.services.freedos.build.context}`);
        }

        // Update base image volume to use absolute path
        const baseImageIdx = composeContent.services.freedos.volumes.findIndex(vol => 
            vol.includes("-base.qcow2") || vol.includes("/oem/base.qcow2")
        );
        if (baseImageIdx !== -1) {
            // Get the version-specific base image filename
            const baseImageFile = this.conf.freedosVersion !== "custom" 
                ? FREEDOS_BASE_IMAGE_FILES[this.conf.freedosVersion]
                : "FD14-base.qcow2"; // Fallback for custom ISOs
            const baseImagePath = path.join(appRoot, "images", baseImageFile);
            composeContent.services.freedos.volumes[baseImageIdx] = `${baseImagePath}:/oem/base.qcow2:ro`;
            logger.info(`Base image path set to: ${baseImagePath}`);
        }

        // Boot image mapping
        if (this.conf.customIsoPath) {
            composeContent.services.freedos.volumes.push(`${this.conf.customIsoPath}:/boot.iso`);
            composeContent.services.freedos.environment.CUSTOM_ISO = "/boot.iso";
        }

        // Storage folder mapping
        const storageFolderIdx = composeContent.services.freedos.volumes.findIndex(vol => vol.includes("/storage"));
        
        if (storageFolderIdx === -1) {
            logger.warn("No /storage volume found in compose template, adding one...");
            composeContent.services.freedos.volumes.push(`${this.conf.installFolder}:/storage`);
        } else {
            composeContent.services.freedos.volumes[storageFolderIdx] = `${this.conf.installFolder}:/storage`;
        }

        // Shared folder mapping
        const sharedFolderIdx = composeContent.services.freedos.volumes.findIndex(vol => vol.includes("/shared"));
        
        if (!this.conf.sharedFolderPath) {
            // Remove shared folder if not enabled
            if (sharedFolderIdx !== -1) {
                composeContent.services.freedos.volumes.splice(sharedFolderIdx, 1);
                logger.info("Removed shared folder as per user configuration");
            }
        } else {
            // Add or update shared folder
            const volumeStr = `${this.conf.sharedFolderPath}:/shared`;
            
            if (sharedFolderIdx === -1) {
                composeContent.services.freedos.volumes.push(volumeStr);
                logger.info(`Added shared folder: ${this.conf.sharedFolderPath}`);
            } else {
                composeContent.services.freedos.volumes[sharedFolderIdx] = volumeStr;
                logger.info(`Updated shared folder to: ${this.conf.sharedFolderPath}`);
            }
        }

        if (!composeContent.services.freedos.environment.ARGUMENTS) {
            composeContent.services.freedos.environment.ARGUMENTS = "";
        }

        composeContent.services.freedos.environment.ARGUMENTS = this.stripSharedDriveArg(
            composeContent.services.freedos.environment.ARGUMENTS,
        );

        if (this.conf.sharedFolderPath) {
            composeContent.services.freedos.environment.ARGUMENTS =
                `${composeContent.services.freedos.environment.ARGUMENTS} ${this.buildSharedDriveArg()}`.trim();
        }

        // Add serial port device mappings if configured
        if (this.conf.serialPorts && this.conf.serialPorts.length > 0) {
            // Add device mappings
            for (const port of this.conf.serialPorts) {
                const deviceMapping = `${port}:${port}`;
                if (!composeContent.services.freedos.devices.includes(deviceMapping)) {
                    composeContent.services.freedos.devices.push(deviceMapping);
                }
            }
            
            // Add QEMU serial arguments
            const serialArgs = this.conf.serialPorts
                .map((port, index) => {
                    const id = `hostserial${index}`;
                    return `-chardev serial,id=${id},path=${port} -device isa-serial,chardev=${id}`;
                })
                .join(" ");
            
            if (serialArgs) {
                composeContent.services.freedos.environment.ARGUMENTS += ` ${serialArgs}`;
            }
        }

        // Write the compose file
        this.container.writeCompose(composeContent);
    }

    async startContainer() {
        this.changeState(InstallStates.STARTING_CONTAINER);
        logger.info("Starting container...");

        // Start the container
        await this.container.compose("up");

        // Cache ports
        await this.container.port();

        // emit vnc port event
        this.emitter.emit("vncPortChanged", getActiveHostPort(this.container, CommonPorts.NOVNC)!);

        logger.info("Container started successfully.");
    }

    async monitorContainerPreinstall() {
        // Sleep a bit to make sure the webserver is up in the container
        await this.sleep(3000);

        this.changeState(InstallStates.MONITORING_PREINSTALL);
        logger.info("Starting preinstall monitoring...");

        const re = new RegExp(/>([^<]+)</);
        while (true) {
            try {
                const vncHostPort = getActiveHostPort(this.container, CommonPorts.NOVNC)!;
                const response = await nodeFetch(`http://127.0.0.1:${vncHostPort}/msg.html`, {
                    signal: AbortSignal.timeout(500),
                });

                if (response.status === 404) {
                    logger.info("Received 404, preinstall completed");
                    return; // Exit the method when we get 404
                }

                const message = await response.text();
                const messageFormatted = re.exec(message)?.[1] || message;
                this.setPreinstallMsg(messageFormatted);
            } catch (error) {
                if (error instanceof Error && error.message.includes("404")) {
                    logger.info("Received 404, preinstall completed");
                    return; // Exit the method when fetch throws 404
                }

                logger.error(`Error monitoring container: ${error}`);
                throw error;
            }

            // Wait 500ms before next check
            await this.sleep(500);
        }
    }

    async monitorInstallation() {
        this.changeState(InstallStates.INSTALLING_FREEDOS);
        logger.info("FreeDOS is installing...");

        // FreeDOS installation is much faster than Windows (typically completes in under 10 seconds)
        // We wait a bit to ensure the VNC interface is stable before declaring completion
        const FREEDOS_INSTALL_WAIT_MS = 10000;
        await this.sleep(FREEDOS_INSTALL_WAIT_MS);

        logger.info("FreeDOS installation completed!");
        this.changeState(InstallStates.COMPLETED);

        // Clean up custom ISO if it was used
        const compose = Dosboat.readCompose(this.container.composeFilePath);
        const filteredVolumes = compose.services.freedos.volumes.filter(
            volume => !volume.endsWith("/boot.iso"),
        );

        if (compose.services.freedos.volumes.length !== filteredVolumes.length) {
            compose.services.freedos.volumes = filteredVolumes;
            logger.info("Removed custom ISO from compose");
            this.container.writeCompose(compose);
        }
    }
                     
    async install() {
        logger.info("Starting installation...");

        try {
            await this.createComposeFile();
            await this.startContainer();
            await this.monitorContainerPreinstall();
            await this.monitorInstallation();
        } catch (e) {
            this.changeState(InstallStates.INSTALL_ERROR);
            logger.error("Errors encountered, could not complete the installation steps.");
            logger.error(e);
            return;
        }
        this.changeState(InstallStates.COMPLETED);

        logger.info("Installation completed successfully.");
    }
}

export async function isInstalled(): Promise<boolean> {
    // Check if a dosboat container exists
    const config = DosboatConfig.readConfigObject(false);

    if (!config) return false;

    const containerRuntime = createContainer(config.containerRuntime);

    return await containerRuntime.exists();
}
