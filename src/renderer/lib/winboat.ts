import { ref, type Ref } from "vue";
import { DOSBOAT_DIR } from "./constants";
import type {
    ComposeConfig,
    Metrics,
} from "../../types";
import { createLogger } from "../utils/log";
import YAML from "yaml";
import { openLink } from "../utils/openLink";
import { DosboatConfig } from "./config";
import { QMPManager } from "./qmp";
import { assert } from "@vueuse/core";
import { setIntervalImmediately } from "../utils/interval";
import { ContainerManager, ContainerStatus } from "./containers/container";
import { CommonPorts, ContainerRuntimes, createContainer, getActiveHostPort } from "./containers/common";

const fs: typeof import("fs") = require("node:fs");
const path: typeof import("path") = require("node:path");
const { promisify }: typeof import("util") = require("node:util");
const { exec }: typeof import("child_process") = require("node:child_process");

const execAsync = promisify(exec);
export const logger = createLogger(path.join(DOSBOAT_DIR, "dosboat.log"));

const QMP_WAIT_MS = 2000;

export class Dosboat {
    private static instance: Dosboat | null = null;
    // Update Intervals
    #metricsInverval: NodeJS.Timeout | null = null;
    #qmpInterval: NodeJS.Timeout | null = null;

    // Variables
    isOnline: Ref<boolean> = ref(false);
    containerStatus: Ref<ContainerStatus> = ref(ContainerStatus.EXITED);
    containerActionLoading: Ref<boolean> = ref(false);
    metrics: Ref<Metrics> = ref<Metrics>({
        cpu: {
            usage: 0,
            frequency: 0,
        },
        ram: {
            used: 0,
            total: 0,
            percentage: 0,
        },
        disk: {
            used: 0,
            total: 0,
            percentage: 0,
        },
    });
    readonly #wbConfig: DosboatConfig | null = null;
    qmpMgr: QMPManager | null = null;
    containerMgr: ContainerManager | null = null;

    static getInstance() {
        Dosboat.instance ??= new Dosboat();
        return Dosboat.instance;
    }

    private constructor() {
        this.#wbConfig = DosboatConfig.getInstance();
        this.containerMgr = createContainer(this.#wbConfig.config.containerRuntime);

        // This is a special interval which will never be destroyed
        setInterval(async () => {
            const _containerStatus = await this.containerMgr!.getStatus();

            if (_containerStatus !== this.containerStatus.value) {
                this.containerStatus.value = _containerStatus;
                logger.info(`Dosboat Container state changed to ${_containerStatus}`);

                if (_containerStatus === ContainerStatus.RUNNING) {
                    await this.containerMgr!.port(); // Cache active port mappings
                    await this.createAPIIntervals();
                } else {
                    await this.destroyAPIIntervals();
                }
            }
        }, 1000);
    }

    /**
     * Creates the intervals which rely on QMP and VM management.
     */
    async createAPIIntervals() {
        logger.info("Creating Dosboat API intervals...");
        const METRICS_WAIT_MS = 1000;

        // *** Metrics Interval ***
        // Make sure we don't have any existing intervals
        if (this.#metricsInverval) {
            clearInterval(this.#metricsInverval);
            this.#metricsInverval = null;
        }

        this.#metricsInverval = setInterval(async () => {
            // If the VM is not ready, don't bother checking metrics
            if (!this.isOnline.value) return;
            this.metrics.value = await this.getMetrics();
        }, METRICS_WAIT_MS);

        // *** QMP Interval ***
        // Make sure we don't have any existing intervals
        if (this.#qmpInterval) {
            clearInterval(this.#qmpInterval);
            this.#qmpInterval = null;
        }

        // TODO: Remove if statement once this feature gets rolled out.
        if (this.#wbConfig?.config.experimentalFeatures) {
            this.createQMPInterval();
        }
    }

    /**
     * Destroys the intervals which rely on the Dosboat VM.
     * This is called when the container is in any state other than Running.
     */
    async destroyAPIIntervals() {
        logger.info("Destroying Dosboat API intervals...");

        if (this.#metricsInverval) {
            clearInterval(this.#metricsInverval);
            this.#metricsInverval = null;
        }

        if (this.#qmpInterval) {
            clearInterval(this.#qmpInterval);
            this.#qmpInterval = null;

            // Side effect: We must destroy the QMP Manager
            try {
                if (this.qmpMgr && (await this.qmpMgr.isAlive())) {
                    this.qmpMgr.qmpSocket.destroy();
                }
                this.qmpMgr = null;
                logger.info("[destroyAPIIntervals] QMP Manager destroyed because container is no longer running");
            } catch (e) {
                logger.error("[destroyAPIIntervals] Failed to destroy QMP Manager");
                logger.error(e);
            }
        }
    }

    async getMetrics() {
        // TODO: Implement metrics collection via QMP for FreeDOS
        return this.metrics.value;
    }

    static readCompose(composePath: string): ComposeConfig {
        const composeFile = fs.readFileSync(composePath, "utf-8");
        const composeContents = YAML.parse(composeFile) as ComposeConfig;
        return composeContents;
    }

    /**
     * Opens the noVNC web interface in the default browser
     */
    launchVNC() {
        const novncHostPort = getActiveHostPort(this.containerMgr!, CommonPorts.NOVNC);
        openLink(`http://127.0.0.1:${novncHostPort}`);
        logger.info(`Launched VNC browser display at http://127.0.0.1:${novncHostPort}`);
    }

    async #connectQMPManager() {
        try {
            this.qmpMgr = await QMPManager.createConnection(
                "127.0.0.1",
                getActiveHostPort(this.containerMgr!, CommonPorts.QMP)!,
            ).catch(e => {
                logger.error(e);
                throw e;
            });
            const capabilities = await this.qmpMgr.executeCommand("qmp_capabilities");
            assert("return" in capabilities);

            const commands = await this.qmpMgr.executeCommand("query-commands");
            // @ts-ignore property "result" already exists due to assert
            assert(commands.return.every(x => "name" in x));
        } catch (e) {
            logger.error("There was an error connecting to QMP");
            logger.error(e);
        }
    }

    createQMPInterval() {
        logger.info("[createQMPInterval] Creating new QMP Interval");
        this.#qmpInterval = setIntervalImmediately(async () => {
            if (!this.#wbConfig?.config.experimentalFeatures) {
                clearInterval(this.#qmpInterval!);
                this.#qmpInterval = null;
                logger.info("[QMPInterval] Destroying self because experimentalFeatures was turned off");
            }

            // If QMP already exists and healthy, we're good
            if (this.qmpMgr && (await this.qmpMgr.isAlive())) return;

            // Otherwise, connect to it since the container is alive but
            // QMP either doesn't exist or is disconnected
            await this.#connectQMPManager();
            logger.info("[QMPInterval] Created new QMP Manager");
        }, QMP_WAIT_MS);
    }

    async startContainer() {
        logger.info("Starting Dosboat container...");
        this.containerActionLoading.value = true;
        try {
            await this.containerMgr!.container("start");
        } catch (e) {
            logger.error("There was an error performing the container action.");
            logger.error(e);
            throw e;
        }
        logger.info("Successfully started Dosboat container");
        this.containerActionLoading.value = false;
    }

    async stopContainer() {
        logger.info("Stopping Dosboat container...");
        this.containerActionLoading.value = true;
        await this.containerMgr!.container("stop");
        logger.info("Successfully stopped Dosboat container");
        this.containerActionLoading.value = false;
    }

    async restartContainer() {
        logger.info("Restarting Dosboat container...");
        this.containerActionLoading.value = true;
        try {
            await this.containerMgr!.container("restart");
        } catch (e) {
            logger.error("There was an error restarting the container.");
            logger.error(e);
            throw e;
        }
        logger.info("Successfully restarted Dosboat container");
        this.containerActionLoading.value = false;
    }

    async pauseContainer() {
        logger.info("Pausing Dosboat container...");
        this.containerActionLoading.value = true;
        await this.containerMgr!.container("pause");
        logger.info("Successfully paused Dosboat container");
        this.containerActionLoading.value = false;
    }

    async unpauseContainer() {
        logger.info("Unpausing Dosboat container...");
        this.containerActionLoading.value = true;
        await this.containerMgr!.container("unpause");
        logger.info("Successfully unpaused Dosboat container");
        this.containerActionLoading.value = false;
    }

    // TODO: refactor / possibly remove this
    /** 
        Replaces the compose file, and and updates the container.
        @note Use {@link ContainerManager.writeCompose} in case only disk write is needed
    */
    async replaceCompose(composeConfig: ComposeConfig) {
        logger.info("Going to replace compose config");
        this.containerActionLoading.value = true;

        const composeFilePath = this.containerMgr!.composeFilePath;

        // 0. Stop the current container if it's online
        if (this.containerStatus.value === ContainerStatus.RUNNING) {
            await this.stopContainer();
        }

        // 1. Compose down the current container
        await this.containerMgr!.compose("down");

        // 2. Create a backup directory if it doesn't exist
        const backupDir = path.join(DOSBOAT_DIR, "backup");

        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir);
            logger.info(`Created compose backup dir: ${backupDir}`);
        }

        // 3. Move the current compose file to backup
        const backupFile = `${Date.now()}-${path.basename(this.containerMgr!.composeFilePath)}`;
        fs.renameSync(composeFilePath, path.join(backupDir, backupFile));
        logger.info(`Backed up current compose at: ${path.join(backupDir, backupFile)}`);

        // 4. Write new compose file
        this.containerMgr!.writeCompose(composeConfig);
        logger.info(`Wrote new compose file to: ${composeFilePath}`);

        // 5. Deploy the container with the new compose file
        await this.containerMgr!.compose("up");

        logger.info("Replace compose config completed, successfully deployed new container");

        this.containerActionLoading.value = false;
    }

    async resetDosboat() {
        console.info("Resetting Dosboat...");

        // 1. Stop container
        await this.stopContainer();
        console.info("Stopped container");

        // 2. Remove the container

        await this.containerMgr!.remove();
        console.info("Removed container");

        // 3. Remove the container volume or folder
        const compose = Dosboat.readCompose(this.containerMgr!.composeFilePath);
        const storage = compose.services.freedos.volumes.find(vol => vol.includes("/storage"));
        if (storage?.startsWith("data:")) {
            if (this.#wbConfig?.config.containerRuntime !== ContainerRuntimes.DOCKER) {
                logger.error("Volume not supported on podman runtime");
            }
            // In this case we have a volume (legacy)
            await execAsync("docker volume rm dosboat_data");
            console.info("Removed volume");
        } else {
            const storageFolder = storage?.split(":").at(0) ?? null;
            if (storageFolder && fs.existsSync(storageFolder)) {
                fs.rmSync(storageFolder, { recursive: true, force: true });
                console.info(`Removed storage folder at ${storageFolder}`);
            } else {
                console.warn("Storage folder does not exist, skipping removal");
            }
        }

        // 4. Remove Dosboat directory
        fs.rmSync(DOSBOAT_DIR, { recursive: true, force: true });
        console.info(`Removed ${DOSBOAT_DIR}`);
        console.info("So long and thanks for all the fish!");
    }

    /**
     * Whether or not the Dosboat singleton has a QMP interval active
     */
    get hasQMPInterval() {
        return this.#qmpInterval !== null;
    }
}
