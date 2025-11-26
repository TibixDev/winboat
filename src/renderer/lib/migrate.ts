import { createLogger } from "../utils/log";
import { ComposePortMapper, Range } from "../utils/port";
import { WinboatConfig } from "./config";
import { WINBOAT_CACHE_DIR, WINBOAT_CONFIG_DIR, WINBOAT_DATA_DIR, WINBOAT_STATE_DIR } from "./constants";
import { CommonPorts, createContainer } from "./containers/common";
import { ContainerManager } from "./containers/container";
import { Winboat } from "./winboat";

const process: typeof import("process") = require("node:process");
const { glob, cp, rm, appendFile, readFile, copyFile, constants, mkdir }: typeof import("node:fs/promises") = require("node:fs/promises");
const path: typeof import("path") = require("node:path");
const logger = createLogger(path.join(WINBOAT_STATE_DIR, "migrations.log"));

/**
 * This function performs the necessary automatic migrations
 * when updating to newer versions of WinBoat
 */
export async function performAutoMigrations(): Promise<void> {
    logger.info("[performAutoMigrations]: Starting automatic migrations");

    const wbConfig = WinboatConfig.getInstance(); // Get WinboatConfig instance
    const containerManager = createContainer(wbConfig.config.containerRuntime);
    const composeMapper = new ComposePortMapper(Winboat.readCompose(containerManager.composeFilePath));
    const previousVersion = wbConfig.config.versionData.previous;
    
    try {
        // In case of a version prior to 0.9.0, the NoVNC port will be set to the default 8006
        // which is how we know we need to perform the migration, because from 0.9.0 we can rely
        // on the stored version strings
        const novncMapping = composeMapper.getShortPortMapping(CommonPorts.NOVNC);
        if (!Range.isRange(novncMapping!.host) && novncMapping!.host === CommonPorts.NOVNC) {
            await migrateComposePorts_Pre090(containerManager);
        }

        if (previousVersion.major <= 9 && previousVersion.generation < 1) {
            await migrateComposeOEMDir_Pre091(containerManager);
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

/**
 * Migrate from ~/.winboat to an XDG Base Directories Specification respecting state
 * 
 * @param onMigrationStart Callback that's called at the start of the migration.
 */
export async function migrateXDGBaseDirs_Pre091(onMigrationStart?: () => void): Promise<void> {
    const WINBOAT_OLD_DIR = path.join(process.env.HOME!, ".winboat");
    const OLD_CONFIG_PATH = path.join(WINBOAT_OLD_DIR, path.basename(WinboatConfig.configPath));
    const configData = WinboatConfig.readConfigObject(false, OLD_CONFIG_PATH);

    if(!configData) return;
    onMigrationStart?.();

    const containerManager = createContainer(configData.containerRuntime);
    const OLD_COMPOSE_PATH = path.join(WINBOAT_OLD_DIR, path.basename(containerManager.composeFilePath));
    const OLD_OEM_PATH = path.join(WINBOAT_OLD_DIR, "oem");
    const NEW_OEM_PATH = path.join(WINBOAT_DATA_DIR, "oem");
    const XDG_DIRS = [WINBOAT_CONFIG_DIR, WINBOAT_DATA_DIR, WINBOAT_STATE_DIR, WINBOAT_CACHE_DIR];

    let currSrc = null, currDest = null;

    // Migrate to XDG base dirs
    try {
        logger.info("[migrateXDGBaseDirs_Pre091]: Starting XDG Base Directory Spec migrations");

        // Ensure paths already exist
        for(const xdgDir of XDG_DIRS) {
            logger.info(`[migrateXDGBaseDirs_Pre091]: Creating directory ${xdgDir}`);
            await mkdir(xdgDir, { mode: 0o700, recursive: true });
        }

        // Copy files
        await copyFile(currSrc = OLD_COMPOSE_PATH, currDest = containerManager.composeFilePath, constants.COPYFILE_EXCL);
        logger.info(`[migrateXDGBaseDirs_Pre091]: Successfully copied compose file '${currSrc}' -> '${currDest}'`);

        await copyFile(currSrc = OLD_CONFIG_PATH, currDest = WinboatConfig.configPath, constants.COPYFILE_EXCL);
        logger.info(`[migrateXDGBaseDirs_Pre091]: Successfully copied config file '${currSrc}' -> '${currDest}'`);

        await cp(currSrc = OLD_OEM_PATH, currDest = NEW_OEM_PATH, { force: false, recursive: true, mode: constants.COPYFILE_EXCL });
        logger.info(`[migrateXDGBaseDirs_Pre091]: Successfully copied oem folder '${currSrc}' -> '${currDest}'`);


        for await (const match of glob(path.join(WINBOAT_OLD_DIR, "*.log"))) {
            const oldLogContent = await readFile(match, { encoding: "utf8" });
            currSrc = match;
            currDest = path.join(WINBOAT_STATE_DIR, path.basename(currSrc));

            logger.info(`[migrateXDGBaseDirs_Pre091]: Appending old log content '${currSrc}' -> '${currDest}'`);
            await appendFile(currDest, oldLogContent, { encoding: "utf8", mode: 0o700 })
            logger.info(`[migrateXDGBaseDirs_Pre091]: Successfully appended old log content '${currSrc}' -> '${currDest}'`);
        }
    } catch(e) {
        logger.error(`[migrateXDGBaseDirs_Pre091]: Copying '${currSrc}' to '${currDest}' failed`);
        logger.error(e);
        return;
    }

    // Remove old .winboat directory
    try {
        logger.info(`[migrateXDGBaseDirs_Pre091]: Removing old winboat directory at '${WINBOAT_OLD_DIR}'`);

        await rm(WINBOAT_OLD_DIR, { recursive: true, force: true });

        logger.info(`[migrateXDGBaseDirs_Pre091]: Successfully removed old winboat directory at '${WINBOAT_OLD_DIR}'`);
    }
    catch(e) {
        logger.error(`[migrateXDGBaseDirs_Pre091]: Removing '${WINBOAT_OLD_DIR}' failed`);
        logger.error(e);
        return;
    }

    logger.info("[migrateXDGBaseDirs_Pre091]: Migration successful");
}

/**
 * The oem directory's location has to be changed in the compose as well,
 * due to the directory changes introduced in #515.
 */
async function migrateComposeOEMDir_Pre091(containerManager: ContainerManager): Promise<void> {
    logger.info("[migrateComposeOEMDir_Pre091]: Performing migrations for 0.9.1");

    // Compose migration
    if (await containerManager.exists()) {
        logger.info("[migrateComposeOEMDir_Pre091]: Composing down current WinBoat container");
        await containerManager.compose("down");
    }

    const currentCompose = Winboat.readCompose(containerManager.composeFilePath);
    const defaultCompose = containerManager.defaultCompose;

    const oldOemIdx = currentCompose.services.windows.volumes.findIndex((entry) => entry.includes("oem"));
    const newOemIdx = defaultCompose.services.windows.volumes.findIndex((entry) => entry.includes("oem"));

    currentCompose.services.windows.volumes[oldOemIdx] = defaultCompose.services.windows.volumes[newOemIdx];

    containerManager.writeCompose(currentCompose);

    logger.info("[migrateComposeOEMDir_Pre091]: Composing up WinBoat container");
    await containerManager.compose("up", ["--no-start"]);
}