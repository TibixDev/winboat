import { type ComposeConfig, type InstallConfiguration } from "../../types";
import { WINBOAT_DIR, WINBOAT_GUEST_API } from "./constants";
import YAML from "json-to-pretty-yaml";
import { createLogger } from "../utils/log";
import { createNanoEvents, type Emitter } from "nanoevents";
const fs: typeof import('fs') = require('fs');
const { exec }: typeof import('child_process') = require('child_process');
const path: typeof import('path') = require('path');
const { promisify }: typeof import('util') = require('util');
const nodeFetch: typeof import('node-fetch').default = require('node-fetch');
const remote: typeof import('@electron/remote') = require('@electron/remote');

const execAsync = promisify(exec);
const logger = createLogger(path.join(WINBOAT_DIR, 'install.log'));

const composeFilePath = path.join(WINBOAT_DIR, 'docker-compose.yml');
export const DefaultCompose: ComposeConfig = {
    "name": "winboat",
    "volumes": {
        "data": null
    },
    "services": {
        "windows": {
            "image": "ghcr.io/dockur/windows:latest",
            "container_name": "WinBoat",
            "environment": {
                "VERSION": "11",
                "RAM_SIZE": "4G",
                "CPU_CORES": "4",
                "DISK_SIZE": "64G",
                "USERNAME": "MyWindowsUser",
                "PASSWORD": "MyWindowsPassword",
                "HOME": "${HOME}",
                "LANGUAGE": "English",
                "HOST_PORTS": "7149",
                "ARGUMENTS": "-cpu host,arch_capabilities=off \n-qmp tcp:0.0.0.0:7149,server,wait=off\n"
            },
            "cap_add": [
                "NET_ADMIN"
            ],
            "privileged": true,
            "ports": [
                "8006:8006", // VNC Web Interface
                "7148:7148", // Winboat Guest Server API
                "7149:7149", // QEMU QMP Port
                "3389:3389/tcp", // RDP
                "3389:3389/udp" // RDP
            ],
            "stop_grace_period": "120s",
            "restart": "on-failure",
            "volumes": [
                "data:/storage",
                "${HOME}:/shared",
                "/dev/bus/usb:/dev/bus/usb", // QEMU Synamic USB Passthrough
                "./oem:/oem",
            ],
            "devices": [
                "/dev/kvm",
            ]
        }
    }
}
export const InstallStates = {
    IDLE: 'Preparing',
    CREATING_COMPOSE_FILE: 'Creating Compose File',
    CREATING_OEM: "Creating OEM Assets",
    STARTING_CONTAINER: 'Starting Container',
    MONITORING_PREINSTALL: 'Monitoring Preinstall',
    INSTALLING_WINDOWS: 'Installing Windows',
    COMPLETED: 'Completed',
    INSTALL_ERROR: 'Install Error'
} as const;

export type InstallState = typeof InstallStates[keyof typeof InstallStates];
interface InstallEvents {
    stateChanged: (state: InstallState) => void;
    preinstallMsg: (msg: string) => void;
    error: (error: Error) => void;
}

export class InstallManager {
    conf: InstallConfiguration;
    emitter: Emitter<InstallEvents>;
    state: InstallState;
    preinstallMsg: string;

    constructor(conf: InstallConfiguration) {
        this.conf = conf;
        this.state = InstallStates.IDLE;
        this.preinstallMsg = ""
        this.emitter = createNanoEvents<InstallEvents>();
    }

    changeState(newState: InstallState) {
        this.state = newState;
        this.emitter.emit('stateChanged', newState);
        logger.info(`New state: "${newState}"`);
    }

    setPreinstallMsg(msg: string) {
        if (msg === this.preinstallMsg) return;
        this.preinstallMsg = msg;
        this.emitter.emit('preinstallMsg', msg);
        logger.info(`Preinstall: "${msg}"`);
    }

    sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    createComposeFile() {
        this.changeState(InstallStates.CREATING_COMPOSE_FILE);

        // Ensure the directory exists
        if (!fs.existsSync(WINBOAT_DIR)) {
            fs.mkdirSync(WINBOAT_DIR);
            logger.info(`Created WinBoat directory: ${WINBOAT_DIR}`);
        }

        // Configure the compose file
        const composeContent = { ...DefaultCompose }

        composeContent.services.windows.environment.RAM_SIZE = `${this.conf.ramGB}G`;
        composeContent.services.windows.environment.CPU_CORES = `${this.conf.cpuThreads}`;
        composeContent.services.windows.environment.DISK_SIZE = `${this.conf.diskSpaceGB}G`;
        composeContent.services.windows.environment.VERSION = this.conf.windowsVersion;
        composeContent.services.windows.environment.LANGUAGE = this.conf.windowsLanguage;
        composeContent.services.windows.environment.USERNAME = this.conf.username;
        composeContent.services.windows.environment.PASSWORD = this.conf.password;
        
        if (this.conf.customIsoPath) {
            composeContent.services.windows.volumes.push(`${this.conf.customIsoPath}:/boot.iso`);
        }
        
        // Write the compose file
        const composeYAML = YAML.stringify(composeContent).replaceAll("null", "");
        fs.writeFileSync(composeFilePath, composeYAML, { encoding: 'utf8' });
        logger.info(`Creating compose file at: ${composeFilePath}`);
        logger.info(`Compose file content: ${JSON.stringify(composeContent, null, 2)}`);
    }

    createOEMAssets() {
        this.changeState(InstallStates.CREATING_OEM);
        logger.info("Creating OEM assets");

        const oemPath = path.join(WINBOAT_DIR, 'oem'); // Fixed the path separator

        // Create OEM directory if it doesn’t exist
        if (!fs.existsSync(oemPath)) {
            fs.mkdirSync(oemPath, { recursive: true });
            logger.info(`Created OEM directory: ${oemPath}`);
        }

        // Determine the source path based on whether the app is bundled
        const appPath = remote.app.isPackaged 
            ? path.join(process.resourcesPath, 'guest_server') // For packaged app
            : path.join(remote.app.getAppPath(), '..', '..', 'guest_server'); // For dev mode

        logger.info(`Guest server source path: ${appPath}`);

        // Check if the source directory exists
        if (!fs.existsSync(appPath)) {
            const error = new Error(`Guest server directory not found at: ${appPath}`);
            logger.error(error.message);
            this.changeState(InstallStates.INSTALL_ERROR);
            throw error;
        }

        const copyRecursive = (src: string, dest: string) => {
            const stats = fs.statSync(src);
            
            if (stats.isDirectory()) {
                // Create directory if it doesn't exist
                if (!fs.existsSync(dest)) {
                    fs.mkdirSync(dest, { recursive: true });
                }
                
                // Copy all contents
                fs.readdirSync(src).forEach(entry => {
                    const srcPath = path.join(src, entry);
                    const destPath = path.join(dest, entry);
                    copyRecursive(srcPath, destPath);
                });
                
                logger.info(`Copied directory ${src} to ${dest}`);
            } else {
                // Copy file
                fs.copyFileSync(src, dest);
                logger.info(`Copied file ${src} to ${dest}`);
            }
        };

        // Copy all files from guest_server to oemPath
        try {
            fs.readdirSync(appPath).forEach(entry => {
                const srcPath = path.join(appPath, entry);
                const destPath = path.join(oemPath, entry);
                copyRecursive(srcPath, destPath);
            });
            logger.info("OEM assets created successfully");
        } catch (error) {
            logger.error(`Failed to copy OEM assets: ${error}`);
            this.changeState(InstallStates.INSTALL_ERROR);
            throw error;
        }
    }

    async startContainer() {
        this.changeState(InstallStates.STARTING_CONTAINER);
        logger.info('Starting container...');

        // Start the container
        try {
            // execSync(`docker compose -f ${composeFilePath} up -d`, { stdio: 'inherit' });
            const { stdout, stderr } = await execAsync(`docker compose -f ${composeFilePath} up -d`);
            if (stderr) {
                logger.error(stderr);
            }
        } catch (e) {
            this.changeState(InstallStates.INSTALL_ERROR);
            logger.error('Failed to start container.');
            logger.error(e);
            throw e;
        }
        logger.info('Container started successfully.');
    }

    async monitorContainerPreinstall() {
        // Sleep a bit to make sure the webserver is up in the container
        await this.sleep(3000);

        this.changeState(InstallStates.MONITORING_PREINSTALL);
        logger.info('Starting preinstall monitoring...');

        while (true) {
            try {
                const response = await nodeFetch('http://127.0.0.1:8006/msg.html');
                if (response.status === 404) {
                    logger.info('Received 404, preinstall completed');
                    return; // Exit the method when we get 404
                }
                const message = await response.text();
                const re = />([^<]+)</;
                const messageFormatted = message.match(re)?.[1] || message;
                this.setPreinstallMsg(messageFormatted);
            } catch (error) {
                if (error instanceof Error && error.message.includes('404')) {
                    logger.info('Received 404, preinstall completed');
                    return; // Exit the method when fetch throws 404
                }
                logger.error(`Error monitoring container: ${error}`);
                this.changeState(InstallStates.INSTALL_ERROR);
                throw error;
            }

            // Wait 500ms before next check
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    async monitorAPIHealth() {
        this.changeState(InstallStates.INSTALLING_WINDOWS);
        logger.info("Waiting for WinBoat Guest Server to wrap up installation...");

        let attempts = 0;

        while (true) {
            try {
                const res = await nodeFetch(`${WINBOAT_GUEST_API}/health`);
                if (res.status === 200) {
                    logger.info("WinBoat Guest Server is up and healthy!");
                    this.changeState(InstallStates.COMPLETED);
                    return;
                }
                // Log every 60 seconds (every 12th attempt with 5-second intervals)
                if (attempts % 12 === 0) {
                    logger.info(`API not ready yet (status: ${res.status}), still waiting after ${attempts * 5 / 60} minutes...`);
                }
            } catch (error) {
                // Log every 60 seconds for errors too
                if (attempts % 12 === 0) {
                    logger.info(`API not responding yet, still waiting after ${attempts * 5 / 60} minutes...`);
                }
            }

            attempts++;
            await this.sleep(5000); // Wait 5 seconds between tries
        }
    }


    async install() {
        logger.info('Starting installation...');
        this.createComposeFile();
        this.createOEMAssets();
        await this.startContainer();
        await this.monitorContainerPreinstall();
        await this.monitorAPIHealth();
        this.changeState(InstallStates.COMPLETED);
        logger.info('Installation completed successfully.');
    }
}

export async function isInstalled() {
    // Check if a docker container named WinBoat exists
    try {
        const { stdout: res } = await execAsync('docker ps -a --filter "name=WinBoat" --format "{{.Names}}"');
        return res.includes('WinBoat');
    } catch(e) {
        logger.error("Failed to get WinBoat status, is Docker installed?");
        logger.error(e);
        return false;
    }
}