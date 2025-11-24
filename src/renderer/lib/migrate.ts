import { createLogger } from "../utils/log";
import { ComposePortMapper, Range } from "../utils/port";
import { WinboatConfig } from "./config";
import { WINBOAT_DATA_DIR, WINBOAT_STATE_DIR } from "./constants";
import { CommonPorts, createContainer } from "./containers/common";
import { ContainerManager } from "./containers/container";
import { Winboat } from "./winboat";

const process: typeof import("process") = require("node:process");
const { glob, cp }: typeof import("node:fs/promises") = require("node:fs/promises");
const { promisify }: typeof import("util") = require("node:util");
const path: typeof import("path") = require("node:path");
const fs: typeof import("fs") = require("node:fs");
const logger = createLogger(path.join(WINBOAT_STATE_DIR, "migrations.log"));

/**
 * This function performs the necessary automatic migrations
 * when updating to newer versions of WinBoat
 */
export async function performAutoMigrations(): Promise<void> {
    logger.info("[performAutoMigrations]: Starting automatic migrations");

    const wbConfig = WinboatConfig.getInstance(); // Get WinboatConfig instance
    const containerManager = createContainer(wbConfig.config.containerRuntime);
    const composeMapper = new ComposePortMapper(Winboat.readCompose(containerManager.composeFilePath))
    
    try {
        // In case of a version prior to 0.9.0, the NoVNC port will be set to the default 8006
        // which is how we know we need to perform the migration, because from 0.9.0 we can rely
        // on the stored version strings
        const novncMapping = composeMapper.getShortPortMapping(CommonPorts.NOVNC);
        console.log(composeMapper);
        if (!Range.isRange(novncMapping!.host) && novncMapping!.host === CommonPorts.NOVNC) {
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

/***
 * Migrate from ~/.winboat to an XDG Base Directories Specification respecting state
 */
export async function migrateXDGBaseDirs_Pre091(containerManager: ContainerManager): Promise<void> {
    const copyFileAsync = promisify(fs.copyFile);

    const WINBOAT_OLD_DIR = path.join(process.env.HOME!, "winboat");
    const OLD_COMPOSE_PATH = path.join(WINBOAT_OLD_DIR, path.basename(containerManager.composeFilePath));
    const OLD_CONFIG_PATH = path.join(WINBOAT_OLD_DIR, path.basename(WinboatConfig.configPath));
    const OLD_OEM_PATH = path.join(WINBOAT_OLD_DIR, "oem");
    const NEW_OEM_PATH = path.join(WINBOAT_DATA_DIR, "oem");

    let currSrc = null, currDest = null;
    try {
        logger.info("[migrateXDGBaseDirs_Pre091]: Starting XDG Base Directory Spec migrations");

        await copyFileAsync(currSrc = OLD_COMPOSE_PATH, currDest = containerManager.composeFilePath, fs.constants.COPYFILE_EXCL);
        await copyFileAsync(currSrc = OLD_CONFIG_PATH, currDest = WinboatConfig.configPath, fs.constants.COPYFILE_EXCL);
        await cp(currSrc = OLD_OEM_PATH, currDest = NEW_OEM_PATH, { force: false });

        for await (const match of glob("*.log", {cwd: WINBOAT_OLD_DIR})) {
            currSrc = match;
            currDest = path.join(WINBOAT_STATE_DIR, path.basename(currSrc));
            await copyFileAsync(currSrc, currDest, fs.constants.COPYFILE_EXCL);
        }
    } catch(e) {
        logger.warn(`[migrateXDGBaseDirs_Pre091]: Copying '${currSrc}' to '${currDest}' failed`);
        logger.warn(e);
        return;
    }

    logger.info("[migrateXDGBaseDirs_Pre091]: Migration successful");
}