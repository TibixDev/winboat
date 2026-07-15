import { createLogger } from "../utils/log";
import { WINBOAT_DIR } from "./constants";

const path: typeof import("path") = require("path");
const logger = createLogger(path.join(WINBOAT_DIR, "migrations.log"));

type Migration = {
    name: string;
    /** Whether the migration needs to run against the current installation */
    isNeeded: () => boolean | Promise<boolean>;
    migrate: () => Promise<void>;
};

/**
 * Migrations run in order on every app start, each gated by its own `isNeeded` check.
 */
const migrations: Migration[] = [
    // No migrations for the current release cycle
];

/**
 * This function performs the necessary automatic migrations
 * when updating to newer versions of WinBoat
 */
export async function performAutoMigrations(): Promise<void> {
    logger.info("[performAutoMigrations]: Starting automatic migrations");

    for (const migration of migrations) {
        try {
            if (!(await migration.isNeeded())) continue;

            logger.info(`[performAutoMigrations]: Running migration '${migration.name}'`);
            await migration.migrate();
        } catch (e: any) {
            logger.error(`[performAutoMigrations]: Migration '${migration.name}' failed`);
            logger.error(e.message ?? e);
        }
    }

    logger.info("[performAutoMigrations]: Finished automatic migrations");
}
