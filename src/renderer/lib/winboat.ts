import { ref, type Ref } from "vue";
import { WINBOAT_DIR, WINBOAT_GUEST_API } from "./constants";
import type { ComposeConfig, Metrics, WinApp } from "../../types";
import { createLogger } from "../utils/log";
import { AppIcons } from "../data/appicons";
import YAML from 'yaml';
import PrettyYAML from "json-to-pretty-yaml";
import { InternalApps } from "../data/internalapps";
import { getFreeRDP } from "../utils/getFreeRDP";
import { WinboatConfig } from "./config";
const nodeFetch: typeof import('node-fetch').default = require('node-fetch');
const path: typeof import('path') = require('path');
const fs: typeof import('fs') = require('fs');
const { promisify }: typeof import('util') = require('util');
const { exec }: typeof import('child_process') = require('child_process');

const execAsync = promisify(exec);

let instance: Winboat | null = null;
const logger = createLogger(path.join(WINBOAT_DIR, 'winboat.log'));

const presetApps: WinApp[] = [
    {
        Name: "⚙️ Windows Desktop",
        Icon: AppIcons[InternalApps.WINDOWS_DESKTOP],
        Source: "internal",
        Path: InternalApps.WINDOWS_DESKTOP
    },
    {
        Name: "⚙️ Windows Explorer",
        Icon: AppIcons[InternalApps.WINDOWS_EXPLORER],
        Source: "internal",
        Path: "%windir%\\explorer.exe"
    }
]

export const ContainerStatus = {
    "Created": "created",
    "Restarting": "restarting",
    "Running": "running",
    "Paused": "paused",
    "Exited": "exited",
    "Dead": "dead"
} as const;

type ContainerStatusValue = typeof ContainerStatus[keyof typeof ContainerStatus];

export class Winboat {
    #healthInterval: NodeJS.Timeout | null = null;
    isOnline: Ref<boolean> = ref(false);
    #containerInterval: NodeJS.Timeout | null = null;
    containerStatus: Ref<ContainerStatusValue> = ref(ContainerStatus.Exited)
    containerActionLoading: Ref<boolean> = ref(false)
    #metricsInverval: NodeJS.Timeout | null = null;
    metrics: Ref<Metrics> = ref<Metrics>({
        cpu: {
            usage: 0,
            frequency: 0
        },
        ram: {
            used: 0,
            total: 0,
            percentage: 0
        },
        disk: {
            used: 0,
            total: 0,
            percentage: 0
        }
    })
    #wbConfig: WinboatConfig | null = null

    constructor() {
        if (instance) return instance;
        
        this.#healthInterval = setInterval(async () => {
            const _isOnline = await this.getHealth();
            if (_isOnline !== this.isOnline.value) {
                this.isOnline.value = _isOnline;
                logger.info(`Winboat Guest API went ${this.isOnline ? 'online' : 'offline'}`);
            }
        }, 1000);

        this.#containerInterval = setInterval(async () => {
            const _containerStatus = await this.getContainerStatus();
            if (_containerStatus !== this.containerStatus.value) {
                this.containerStatus.value = _containerStatus;
                logger.info(`Winboat Container state changed to ${_containerStatus}`);
            }
        }, 1000);

        this.#metricsInverval = setInterval(async () => {
            if (!this.isOnline.value) return;
            this.metrics.value = await this.getMetrics();
        }, 1000);

        this.#wbConfig = new WinboatConfig();

        instance = this;

        return instance;
    }

    async getHealth() {
        // If /health returns 200, then the guest is ready
        try {
            const res = await nodeFetch(`${WINBOAT_GUEST_API}/health`);
            return res.status === 200;
        } catch(e) {
            return false;
        }
    }

    async getContainerStatus() {
        const { stdout: _containerStatus } = await execAsync(`docker inspect --format="{{.State.Status}}" WinBoat`);
        return _containerStatus.trim() as ContainerStatusValue;
    }

    async getApps() {
        const res = await nodeFetch(`${WINBOAT_GUEST_API}/apps`);
        const apps = await res.json() as WinApp[];
        apps.push(...presetApps);
        return apps;
    }

    async getMetrics() {
        const res = await nodeFetch(`${WINBOAT_GUEST_API}/metrics`);
        const metrics = await res.json() as Metrics;
        return metrics;
    }

    parseCompose() {
        const composeFile = fs.readFileSync(path.join(WINBOAT_DIR, 'docker-compose.yml'), 'utf-8');
        const composeContents = YAML.parse(composeFile) as ComposeConfig;
        return composeContents;
    }

    getCredentials() {
        const compose = this.parseCompose();
        return {
            username: compose.services.windows.environment.USERNAME,
            password: compose.services.windows.environment.PASSWORD
        }
    }

    async startContainer() {
        logger.info("Starting WinBoat container...");
        this.containerActionLoading.value = true;
        try {
            const { stdout } = await execAsync("docker container start WinBoat");
            logger.info(`Container response: ${stdout}`);
        } catch(e) {
            logger.error("There was an error performing the container action.");
            logger.error(e);
            throw e;
        }
        logger.info("Successfully started WinBoat container");
        this.containerActionLoading.value = false;
    }

    async stopContainer() {
        logger.info("Stopping WinBoat container...");
        this.containerActionLoading.value = true;
        try {
            const { stdout } = await execAsync("docker container stop WinBoat");
            logger.info(`Container response: ${stdout}`);
        } catch(e) {
            logger.error("There was an error performing the container action.");
            logger.error(e);
            throw e;
        }
        logger.info("Successfully stopped WinBoat container");
        this.containerActionLoading.value = false;
    }

    async pauseContainer() {
        logger.info("Pausing WinBoat container...");
        this.containerActionLoading.value = true;
        try {
            const { stdout } = await execAsync("docker container pause WinBoat");
            logger.info(`Container response: ${stdout}`);
            // TODO: The heartbeat check should set this, but it doesn't because normal fetch timeout doesn't exist
            // Fix it once you change fetch to something else
            this.isOnline.value = false;
        } catch(e) {
            logger.error("There was an error performing the container action.");
            logger.error(e);
            throw e;
        }
        logger.info("Successfully paused WinBoat container");
        this.containerActionLoading.value = false;
    }

    async unpauseContainer() {
        logger.info("Unpausing WinBoat container...");
        this.containerActionLoading.value = true;
        try {
            const { stdout } = await execAsync("docker container unpause WinBoat");
            logger.info(`Container response: ${stdout}`);
        } catch(e) {
            logger.error("There was an error performing the container action.");
            logger.error(e);
            throw e;
        }
        logger.info("Successfully unpaused WinBoat container");
        this.containerActionLoading.value = false;
    }

    async replaceCompose(composeConfig: ComposeConfig) {
        logger.info("Going to replace compose config");
        this.containerActionLoading.value = true;

        const composeFilePath = path.join(WINBOAT_DIR, 'docker-compose.yml');

        // 0. Stop the current container if it's online
        if (this.containerStatus.value === ContainerStatus.Running) {
            await this.stopContainer();
        }

        // 1. Compose down the current container
        await execAsync(`docker compose -f ${composeFilePath} down`);

        // 2. Create a backup directory if it doesn't exist
        const backupDir = path.join(WINBOAT_DIR, 'backup');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir);
            logger.info(`Created compose backup dir: ${backupDir}`)
        }

        // 3. Move the current compose file to backup
        const backupFile = `${Date.now()}-docker-compose.yml`;
        fs.renameSync(composeFilePath, path.join(backupDir, backupFile));
        logger.info(`Backed up current compose at: ${path.join(backupDir, backupFile)}`);

        // 4. Write new compose file
        const newComposeYAML = PrettyYAML.stringify(composeConfig).replaceAll("null", "");
        fs.writeFileSync(composeFilePath, newComposeYAML, { encoding: 'utf8' });
        logger.info(`Wrote new compose file to: ${composeFilePath}`);

        // 5. Deploy the container with the new compose file
        await execAsync(`docker compose -f ${composeFilePath} up -d`);
        logger.info("Replace compose config completed, successfully deployed new container");

        this.containerActionLoading.value = false;
    }

    async resetWinboat() {
        console.info("Resetting Winboat...");

        // 1. Stop container
        await this.stopContainer();
        console.info("Stopped container");
        
        // 2. Remove the container
        await execAsync("docker rm WinBoat")
        console.info("Removed container")

        // 3. Remove the container volume
        await execAsync("docker volume rm winboat_data");
        console.info("Removed volume");
        
        // 4. Close logger
        logger.close();

        // 5. Remove WinBoat directory
        fs.unlinkSync(WINBOAT_DIR);
        console.info(`Removed ${WINBOAT_DIR}`);
        console.info("So long and thanks for all the fish!");
    }

    async launchApp(app: WinApp) {
        if (!this.isOnline) throw new Error('Cannot launch app, Winboat is offline');

        const { username, password } = this.getCredentials();
        logger.info(`Launching app: ${app.Name} at path ${app.Path}`);
        
        const freeRDPBin = await getFreeRDP();

        logger.info(`Using FreeRDP Command: '${freeRDPBin}'`);

        let cmd = `${freeRDPBin} /u:"${username}"\
        /p:"${password}"\
        /v:127.0.0.1\
        /cert:ignore\
        +clipboard\
        -wallpaper\
        /sound:sys:pulse\
        /microphone:sys:pulse\
        /floatbar\
        /compression\
        /scale:${this.#wbConfig?.config.scale ?? 100}\
        /wm-class:"${app.Name}"\
        /app:program:"${app.Path}",name:"${app.Name}" &`;

        if (app.Path == InternalApps.WINDOWS_DESKTOP) {
            cmd = `${freeRDPBin} /u:"${username}"\
                /p:"${password}"\
                /v:127.0.0.1\
                /cert:ignore\
                +clipboard\
                +f\
                /sound:sys:pulse\
                /microphone:sys:pulse\
                /floatbar\
                /scale:${this.#wbConfig?.config.scale ?? 100}\
                /compression &`;
        }

        // Multiple spaces become one
        cmd = cmd.replace(/\s+/g, " ");

        logger.info(`Launch command:\n${cmd}`);

        await execAsync(cmd);
    }
}