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
    const versionData = wbConfig.config.versionData;

    // No migration needed if this is not a version update
    if (!versionData.previous.lessThan(versionData.current)) return false;

    const previous = versionData.previous;
    const threshold = new DosboatVersion("0.1.0");

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
    const composeMapper = new ComposePortMapper(Dosboat.readCompose(containerManager.composeFilePath));

    let migrated = false;
    try {
        const previous = wbConfig.config.versionData.previous;
        const threshold = new DosboatVersion("0.1.0");

        if (previous.lessThan(threshold)) {
            const novncMapping = composeMapper.getShortPortMapping(CommonPorts.NOVNC);
            console.log(composeMapper);
            if (!Range.isRange(novncMapping!.host) && novncMapping!.host === CommonPorts.NOVNC) {
                await migrateComposePorts_Pre090(containerManager);
                migrated = true;
            }
        }
    } catch (error: unknown) {
        logger.error("[performAutoMigrations]: Automatic migrations failed");
        if (error instanceof Error) {
            logger.error(error.message);
        } else {
            logger.error(String(error));
        }
        return;
    }

    // Always update migration state after processing
    wbConfig.config.versionData = {
        ...wbConfig.config.versionData,
        migrationComplete: true,
        previous: wbConfig.config.versionData.current,
    };

    if (migrated) {
        logger.info("[performAutoMigrations]: Completed necessary migrations.");
    }

    logger.info("[performAutoMigrations]: Finished automatic migrations");
}

/**
 * Perform compose port migrations for pre-0.1.0 installations
 */
async function migrateComposePorts_Pre090(containerManager: ContainerManager): Promise<void> {
    logger.info("[migrateComposePorts_Pre090]: Performing migrations for 0.1.0");

    // Compose migration
    if (await containerManager.exists()) {
        logger.info("[migrateComposePorts_Pre090]: Composing down current WinBoat container");
        await containerManager.compose("down");
    }

    const currentCompose = Dosboat.readCompose(containerManager.composeFilePath);
    const defaultCompose = containerManager.defaultCompose;

    currentCompose.services.freedos.ports = defaultCompose.services.freedos.ports;
    currentCompose.services.freedos.image = defaultCompose.services.freedos.image;
    currentCompose.services.freedos.environment["USER_PORTS"] =
        defaultCompose.services.freedos.environment["USER_PORTS"];

    containerManager.writeCompose(currentCompose);

    // Mark migration as complete by changing the NoVNC host port to prevent re-migration
    const composeMapper = new ComposePortMapper(currentCompose);
    const novncMapping = composeMapper.getShortPortMapping(CommonPorts.NOVNC);
    if (novncMapping) {
        composeMapper.setShortPortMapping(CommonPorts.NOVNC, 8007, {
            hostIP: novncMapping.hostIP,
            protocol: novncMapping.protocol,
        });
        currentCompose.services.freedos.ports = composeMapper.composeFormat;
        containerManager.writeCompose(currentCompose);
    }

    logger.info("[migrateComposePorts_Pre090]: Composing up WinBoat container");
    await containerManager.compose("up", ["--no-start"]);
}
