import { createLogger } from "../utils/log";
import { ComposePortMapper, Range } from "../utils/port";
import { DosboatConfig, DosboatVersion } from "./config";
import { DOSBOAT_DIR } from "./constants";
import { CommonPorts, createContainer } from "./containers/common";
import { ContainerManager } from "./containers/container";
import { Dosboat } from "./winboat";

const path: typeof import("path") = require("path");
const logger = createLogger(path.join(DOSBOAT_DIR, "migrations.log"));

/**
 * Detects if automatic migrations are needed
 */
export function detectMigrationNeeded(): boolean {
    const wbConfig = DosboatConfig.getInstance();
    const previous = wbConfig.config.versionData.previous;
    const threshold = new DosboatVersion("0.9.0");

    if (previous.lessThan(threshold)) return true;

    // Legacy check for configs without proper version history
    const containerManager = createContainer(wbConfig.config.containerRuntime);
    const composeMapper = new ComposePortMapper(Dosboat.readCompose(containerManager.composeFilePath));
    const novncMapping = composeMapper.getShortPortMapping(CommonPorts.NOVNC);

    if (!novncMapping) return false;
    return !Range.isRange(novncMapping.host) && novncMapping.host === CommonPorts.NOVNC;
}

/**
 * This function performs the necessary automatic migrations
 * when updating to newer versions of WinBoat
 */
export async function performAutoMigrations(): Promise<void> {
    logger.info("[performAutoMigrations]: Starting automatic migrations");

    const wbConfig = DosboatConfig.getInstance(); // Get DosboatConfig instance
    const containerManager = createContainer(wbConfig.config.containerRuntime);
    const composeMapper = new ComposePortMapper(Dosboat.readCompose(containerManager.composeFilePath))
    
    let migrated = false;
    try {
        // In case of a version prior to 0.9.0, the NoVNC port will be set to the default 8006
        // which is how we know we need to perform the migration, because from 0.9.0 we can rely
        // on the stored version strings
        const previous = wbConfig.config.versionData.previous;
        const threshold = new DosboatVersion("0.9.0");

        if (previous.lessThan(threshold)) {
            const novncMapping = composeMapper.getShortPortMapping(CommonPorts.NOVNC);
            console.log(composeMapper);
            if (!Range.isRange(novncMapping!.host) && novncMapping!.host === CommonPorts.NOVNC) {
                await migrateComposePorts_Pre090(containerManager);
                migrated = true;
            }
        }
    }
    catch (e: any) {
        logger.error("[performAutoMigrations]: Automatic migrations failed");
        logger.error(e.message ?? e);
        return;
    }

    if (migrated) {
        // Update the config to mark migration as complete
        const threshold = new DosboatVersion("0.9.0");
        wbConfig.config.versionData.previous = threshold;
        logger.info("[performAutoMigrations]: Updated config previous version to mark migration complete");
    }

    // If previous version was < 0.9.0, update it to prevent future checks
    const previous = wbConfig.config.versionData.previous;
    const threshold = new DosboatVersion("0.9.0");
    if (previous.lessThan(threshold)) {
        wbConfig.config.versionData = { ...wbConfig.config.versionData, previous: threshold };
        logger.info("[performAutoMigrations]: Updated config previous version to 0.9.0 to prevent future migration checks");
    }

    logger.info("[performAutoMigrations]: Finished automatic migrations");
}

/**
 * Perform compose port migrations for pre-0.9.0 installations
 */
async function migrateComposePorts_Pre090(containerManager: ContainerManager): Promise<void> {
    logger.info("[migrateComposePorts_Pre090]: Performing migrations for 0.9.0");

    // Compose migration
    if (await containerManager.exists()) {
        logger.info("[migrateComposePorts_Pre090]: Composing down current WinBoat container");
        await containerManager.compose("down");
    }

    const currentCompose = Dosboat.readCompose(containerManager.composeFilePath);
    const defaultCompose = containerManager.defaultCompose;

    currentCompose.services.freedos.ports = defaultCompose.services.freedos.ports;
    currentCompose.services.freedos.image = defaultCompose.services.freedos.image;
    currentCompose.services.freedos.environment["USER_PORTS"] = defaultCompose.services.freedos.environment["USER_PORTS"];

    containerManager.writeCompose(currentCompose);

    // Mark migration as complete by changing the NoVNC host port to prevent re-migration
    const composeMapper = new ComposePortMapper(currentCompose);
    const novncMapping = composeMapper.getShortPortMapping(CommonPorts.NOVNC);
    if (novncMapping) {
        composeMapper.setShortPortMapping(CommonPorts.NOVNC, 8007, { hostIP: novncMapping.hostIP, protocol: novncMapping.protocol });
        currentCompose.services.freedos.ports = composeMapper.composeFormat;
        containerManager.writeCompose(currentCompose);
    }

    logger.info("[migrateComposePorts_Pre090]: Composing up WinBoat container");
    await containerManager.compose("up", ["--no-start"]);
}