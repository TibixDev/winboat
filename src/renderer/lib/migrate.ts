import { createLogger } from "../utils/log";
import { WinboatConfig } from "./config";
import { WINBOAT_DIR } from "./constants";
import { CommonPorts, createContainer, getActiveHostPort } from "./containers/common";
import { ContainerManager } from "./containers/container";
import { Winboat } from "./winboat";

const path: typeof import("path") = require("path");
const logger = createLogger(path.join(WINBOAT_DIR, "migrations.log"));

/**
 * This function performs the necessary automatic migrations
 * when updating to newer versions of WinBoat
 */
export async function performAutoMigrations(): Promise<void> {
    logger.info("[performAutoMigrations]: Starting automatic migrations");

    const wbConfig = WinboatConfig.getInstance(); // Get WinboatConfig instance
    const containerManager = createContainer(wbConfig.config.containerRuntime);
    
    try {
        // In case of a version prior to 0.9.0, the NoVNC port will be set to the default 8006
        // which is how we know we need to perform the migration, because from 0.9.0 we can rely
        // on the stored version strings
        if (getActiveHostPort(containerManager, CommonPorts.NOVNC) === CommonPorts.NOVNC) {
            await migrateComposePorts_Pre090(containerManager);
        }
    }
    catch (e: any) {
        logger.error("[performAutoMigrations]: Automatic migrations failed");
        logger.error(e.message ?? e);
        return;
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

    const currentCompose = Winboat.readCompose(containerManager.composeFilePath);
    const defaultCompose = containerManager.defaultCompose;

    currentCompose.services.windows.ports = defaultCompose.services.windows.ports;
    currentCompose.services.windows.image = defaultCompose.services.windows.image;
    currentCompose.services.windows.environment["USER_PORTS"] = defaultCompose.services.windows.environment["USER_PORTS"];

    containerManager.writeCompose(currentCompose);

    logger.info("[migrateComposePorts_Pre090]: Composing up WinBoat container");
    await containerManager.compose("up", ["--no-start"]);
}