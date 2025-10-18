import { WINBOAT_DIR } from "./constants";
import { WinboatConfig } from "./config";
import { createLogger } from "../utils/log";
import type { SnapshotInfo } from "../../types";

const fs: typeof import("fs") = require("fs");
const path: typeof import("path") = require("path");
const { promisify }: typeof import("util") = require("util");
const { exec }: typeof import("child_process") = require("child_process");

const execAsync = promisify(exec);
const logger = createLogger(path.join(WINBOAT_DIR, "snapshot.log"));

/**
 * SnapshotManager handles creation, restoration, and deletion of VM snapshots.
 * Supports both Docker named volumes and bind mounts.
 * Implements cold snapshots (container must be stopped during operations).
 */
export class SnapshotManager {
    #wbConfig: WinboatConfig;
    #snapshotsDir: string;

    constructor() {
        this.#wbConfig = new WinboatConfig();
        this.#snapshotsDir = this.#wbConfig.config.snapshotPath;

        if (!fs.existsSync(this.#snapshotsDir)) {
            fs.mkdirSync(this.#snapshotsDir, { recursive: true });
            logger.info(`Created snapshots directory: ${this.#snapshotsDir}`);
        }
    }

    /**
     * Creates a cold snapshot of the VM storage.
     * Container must be stopped before calling this method.
     * @param name - Human-readable snapshot name
     * @param storageInfo - Storage type (volume/bind) and path
     */
    async createSnapshot(name: string, storageInfo: { type: "volume" | "bind"; path: string }): Promise<void> {
        logger.info(`=== Starting snapshot creation ===`);
        logger.info(`Snapshot name: ${name}`);
        logger.info(`Storage type: ${storageInfo.type}`);
        logger.info(`Storage path: ${storageInfo.path}`);

        const timestamp = Date.now();
        const snapshotId = `${timestamp}-${name.replace(/[^a-zA-Z0-9]/g, "_")}`;
        const snapshotPath = path.join(this.#snapshotsDir, snapshotId);

        try {
            // Create snapshot directory
            logger.info(`Creating snapshot directory: ${snapshotPath}`);
            fs.mkdirSync(snapshotPath, { recursive: true });
            logger.info(`✓ Snapshot directory created`);

            if (storageInfo.type === "volume") {
                // Determine output file based on compression setting
                const outputFile = this.#wbConfig.config.snapshotCompression ? `${snapshotPath}/data.tar.gz` : `${snapshotPath}/data.tar`;

                logger.info(`Starting volume export to ${outputFile}...`);
                logger.info(`Compression: ${this.#wbConfig.config.snapshotCompression ? "enabled (using pigz)" : "disabled"}`);
                logger.info(`This may take several minutes depending on VM size`);

                const startTime = Date.now();

                // Build docker command with optional pigz compression pipeline
                const dockerCmd = this.#wbConfig.config.snapshotCompression
                    ? `docker run --rm -v ${storageInfo.path}:/source -v ${snapshotPath}:/backup alpine sh -c "apk add --no-cache pigz && tar cvf - -C /source . | pigz > /backup/data.tar.gz"`
                    : `docker run --rm -v ${storageInfo.path}:/source -v ${snapshotPath}:/backup alpine tar cvf /backup/data.tar -C /source .`;

                logger.info(`Docker command: ${dockerCmd}`);

                // Start file-size sampler & heartbeat for volume export
                const stopSizeSampler = this.#startFileSizeSampler(outputFile, "snapshot.volume.export");
                const stopHeartbeat = this.#startHeartbeat("snapshot.volume.export");

                // Use exec() to capture real-time output
                await new Promise<void>((resolve, reject) => {
                    const process = exec(dockerCmd);
                    let lineCount = 0;

                    // Monitor stdout for file processing progress
                    process.stdout?.on("data", (data: string) => {
                        const lines = data.split("\n").filter((l) => l.trim());
                        lineCount += lines.length;
                        if (lines.length) {
                            logger.info(`[snapshot.volume.export] stdout: +${lines.length} lines (total ~${lineCount})`);
                        }
                    });

                    // Keep stderr to show tar file list
                    process.stderr?.on("data", (data: string) => {
                        const stderr = data.toString().trim();
                        // Filter out apk noise, keep tar lines and actual warnings
                        if (!stderr.includes("fetch") && !stderr.includes("OK:")) {
                            // Could be tar file names or real warnings
                            logger.warn(`Docker stderr: ${stderr}`);
                        }
                    });

                    process.on("exit", (code: number) => {
                        // stop samplers
                        stopSizeSampler();
                        stopHeartbeat();
                        if (code === 0) {
                            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                            logger.info(`✓ Volume export completed in ${duration} seconds (~${lineCount} lines seen)`);
                            resolve();
                        } else {
                            reject(new Error(`Docker process exited with code ${code}`));
                        }
                    });

                    process.on("error", (error: Error) => {
                        // stop samplers
                        stopSizeSampler();
                        stopHeartbeat();
                        logger.error(`Docker process error: ${error.message}`);
                        reject(error);
                    });
                });

                // Get final file size
                const finalSizeBytes = fs.statSync(outputFile).size;
                const finalSizeMB = (finalSizeBytes / 1024 / 1024).toFixed(2);
                logger.info(`Final snapshot size: ${finalSizeMB} MB`);

                if (this.#wbConfig.config.snapshotCompression) {
                    logger.info(`Compressed snapshot saved to ${outputFile}`);
                } else {
                    logger.info(`Uncompressed snapshot saved to ${outputFile}`);
                }
            } else {
                // Bind mount snapshot with optional compression
                logger.info(`Starting directory snapshot from ${storageInfo.path}...`);
                const startTime = Date.now();

                if (this.#wbConfig.config.snapshotCompression) {
                    // Create compressed tar directly with progress logging (tar verbose -> count entries)
                    const tarPath = `${snapshotPath}.tar.gz`;
                    logger.info(`Creating compressed snapshot at ${tarPath}...`);

                    const hasPigz = await this.#hasCmd("pigz");
                    if (hasPigz) {
                        logger.info(`Using pigz for parallel compression`);
                        const cmd = `tar cvf - -C "${storageInfo.path}" . | pigz > "${tarPath}"`;
                        await this.#runPipelineWithProgress(cmd, "snapshot.bind.compress");
                    } else {
                        logger.info(`pigz not available, using gzip`);
                        const cmd = `tar cvf - -C "${storageInfo.path}" . | gzip > "${tarPath}"`;
                        await this.#runPipelineWithProgress(cmd, "snapshot.bind.compress");
                    }

                    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                    logger.info(`✓ Compressed snapshot created in ${duration} seconds`);

                    // Remove the empty directory
                    fs.rmSync(snapshotPath, { recursive: true, force: true });

                    const finalSizeBytes = fs.statSync(tarPath).size;
                    const finalSizeMB = (finalSizeBytes / 1024 / 1024).toFixed(2);
                    logger.info(`Final snapshot size: ${finalSizeMB} MB`);
                } else {
                    // Copy directory without compression
                    await this.#copyDirectory(storageInfo.path, snapshotPath);
                    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                    logger.info(`✓ Directory copy completed in ${duration} seconds`);

                    const finalSize = this.#calculateDirectorySize(snapshotPath);
                    const finalSizeMB = (finalSize / 1024 / 1024).toFixed(2);
                    logger.info(`Final snapshot size: ${finalSizeMB} MB`);
                }
            }

            // Enforce snapshot limit (delete old snapshots if over limit)
            logger.info(`Enforcing snapshot limit (max: ${this.#wbConfig.config.snapshotMaxCount})...`);
            await this.#enforceSnapshotLimit();

            logger.info(`=== Snapshot created successfully: ${snapshotId} ===`);
        } catch (error) {
            logger.error(`=== Snapshot creation failed ===`);
            logger.error(`Error: ${error}`);
            logger.error(`Error details: ${JSON.stringify(error, null, 2)}`);

            // Cleanup failed snapshot directory
            if (fs.existsSync(snapshotPath)) {
                logger.info(`Cleaning up failed snapshot directory...`);
                fs.rmSync(snapshotPath, { recursive: true, force: true });
            }
            throw error;
        }
    }

    /**
     * Restores a snapshot to the VM storage.
     * Container must be stopped before calling this method.
     * @param snapshotId - ID of the snapshot to restore
     * @param storageInfo - Storage type (volume/bind) and path
     */
    async restoreSnapshot(snapshotId: string, storageInfo: { type: "volume" | "bind"; path: string }): Promise<void> {
        logger.info(`=== Starting snapshot restoration ===`);
        logger.info(`Snapshot ID: ${snapshotId}`);
        logger.info(`Storage type: ${storageInfo.type}`);
        logger.info(`Storage path: ${storageInfo.path}`);

        const snapshot = this.listSnapshots().find((s) => s.id === snapshotId);
        if (!snapshot) {
            const error = `Snapshot not found: ${snapshotId}`;
            logger.error(error);
            throw new Error(error);
        }

        logger.info(`Found snapshot: ${snapshot.name}`);
        logger.info(`Snapshot path: ${snapshot.path}`);
        logger.info(`Compressed: ${snapshot.compressed}`);
        logger.info(`Size: ${(snapshot.size / 1024 / 1024).toFixed(2)} MB`);

        try {
            if (storageInfo.type === "volume") {
                await this.#restoreVolumeSnapshot(snapshot, storageInfo.path);
            } else {
                await this.#restoreBindMountSnapshot(snapshot, storageInfo.path);
            }

            logger.info(`=== Snapshot restored successfully: ${snapshotId} ===`);
        } catch (error) {
            logger.error(`=== Snapshot restoration failed ===`);
            logger.error(`Error: ${error}`);
            logger.error(`Error details: ${JSON.stringify(error, null, 2)}`);
            throw error;
        }
    }

    /**
     * Restores a snapshot to a Docker named volume.
     * - Uses pigz if available (fallback to gunzip) for .tar.gz.
     * - Emits periodic progress without extra dependencies:
     *   * counts lines from `tar -v` output
     *   * samples written bytes with `du -sb` inside a short-lived docker every 10s
     * - Enables pipefail when bash is available.
     * - Preserves perms but does not force owners (`--no-same-owner`).
     * @private
     */
    async #restoreVolumeSnapshot(snapshot: SnapshotInfo, volumeName: string): Promise<void> {
        logger.info(`--- Volume Snapshot Restoration ---`);

        // Resolve archive path (folder with data.tar(.gz) or a single file)
        let tarPath: string;
        let isCompressed = false;

        const st = fs.statSync(snapshot.path);
        if (st.isDirectory()) {
            const gz = path.join(snapshot.path, "data.tar.gz");
            const tar = path.join(snapshot.path, "data.tar");
            if (fs.existsSync(gz)) {
                tarPath = gz;
                isCompressed = true;
                logger.info(`Found compressed tar: ${tarPath}`);
            } else if (fs.existsSync(tar)) {
                tarPath = tar;
                isCompressed = false;
                logger.info(`Found uncompressed tar: ${tarPath}`);
            } else {
                throw new Error(`No tar file found in snapshot directory: ${snapshot.path}`);
            }
        } else {
            tarPath = snapshot.path;
            isCompressed = snapshot.compressed;
            logger.info(`Snapshot is tar file: ${tarPath}`);
        }

        // Step 1: empty destination volume
        logger.info(`Step 1: Emptying volume ${volumeName}...`);
        const t0 = Date.now();
        await execAsync(`docker run --rm -v "${volumeName}":/target alpine sh -c "rm -rf /target/*"`);
        logger.info(`✓ Volume emptied in ${((Date.now() - t0) / 1000).toFixed(2)} seconds`);

        // Capabilities
        const hasBash = await execAsync(`command -v bash >/dev/null 2>&1 && echo yes || echo no`)
            .then((o) => o.stdout.toString().trim() === "yes")
            .catch(() => false);

        // Always pass the file to the decompressor
        const decompressor = isCompressed ? `(command -v pigz >/dev/null 2>&1 && pigz -dc "${tarPath}" || gunzip -c "${tarPath}")` : `cat "${tarPath}"`;

        // Use verbose tar to emit filenames
        const containerTarCmd = `tar xpvf - --no-same-owner -C /target`;

        const innerPipeline = `${decompressor} | ` + `docker run --rm -i -v "${volumeName}":/target alpine ` + `sh -c "${containerTarCmd}"`;

        const restoreCmd = hasBash
            ? `bash -lc 'set -o pipefail; ${innerPipeline.replace(/'/g, `'\\''`)}'` // pipefail
            : `sh -c '${innerPipeline.replace(/'/g, `'\\''`)}'`;

        logger.info(`Step 2: Restoring data from ${tarPath}...`);
        logger.info(`Restore command: ${restoreCmd}`);

        const start = Date.now();

        // Periodic size sampler (bytes written into the volume)
        let sampler: NodeJS.Timeout | null = setInterval(async () => {
            try {
                const { stdout } = await execAsync(`docker run --rm -v "${volumeName}":/t alpine sh -c 'du -sb /t 2>/dev/null | cut -f1 || echo 0'`);
                const bytes = parseInt(stdout.toString().trim() || "0", 10);
                const mb = (bytes / 1024 / 1024).toFixed(2);
                const secs = ((Date.now() - start) / 1000).toFixed(0);
                logger.info(`Progress: written ~${mb} MB to volume (${secs}s elapsed)`);
            } catch {
                // ignore transient errors while the container is writing
            }
        }, 10000);

        await new Promise<void>((resolve, reject) => {
            const child = exec(restoreCmd, { maxBuffer: 1024 * 1024 * 512 });
            let fileLines = 0;
            let last500 = 0;
            let lastTick = Date.now();

            // Heartbeat: never looks frozen
            const heartbeat = setInterval(() => {
                const secs = ((Date.now() - start) / 1000).toFixed(0);
                logger.info(`Heartbeat: still restoring... ${secs}s elapsed, ~${fileLines} entries logged`);
            }, 10000);

            const handleChunk = (chunk: string) => {
                const lines = chunk
                    .toString()
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean);
                fileLines += lines.length;

                if (fileLines - last500 >= 500) {
                    // every ~500 entries
                    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                    const rate = ((fileLines / (Date.now() - start)) * 1000).toFixed(1);
                    logger.info(`Extracted ~${fileLines} entries so far (${elapsed}s, ${rate} lines/sec)...`);
                    last500 = fileLines;
                }

                const now = Date.now();
                if (now - lastTick > 15000) {
                    const elapsed = ((now - start) / 1000).toFixed(1);
                    logger.info(`Still extracting... ~${fileLines} entries in ${elapsed}s`);
                    lastTick = now;
                }
            };

            // tar -v can print to stdout or stderr depending on build; capture both
            child.stdout?.on("data", handleChunk);
            child.stderr?.on("data", handleChunk);

            child.on("close", (code) => {
                if (sampler) {
                    clearInterval(sampler);
                    sampler = null;
                }
                clearInterval(heartbeat);
                if (code === 0) {
                    const secs = ((Date.now() - start) / 1000).toFixed(2);
                    logger.info(`✓ Data restored in ${secs} seconds, ~${fileLines} entries logged`);
                    resolve();
                } else {
                    reject(new Error(`Restore process exited with code ${code}`));
                }
            });

            child.on("error", (err) => {
                if (sampler) {
                    clearInterval(sampler);
                    sampler = null;
                }
                clearInterval(heartbeat);
                logger.error(`Restore process error: ${err.message}`);
                reject(err);
            });
        });

        logger.info(`✓ Snapshot restored to volume ${volumeName}`);
    }

    /**
     * Restores a snapshot to a bind-mounted directory.
     * - For .tar.gz uses pigz if available (fallback to gunzip).
     * - Emits periodic progress with:
     *   * filename counting from `tar -v`
     *   * host-side size sampling via `du -sb "<path>"`
     * - Heartbeat every 10s; no extra dependencies.
     * - Atomic rollback using a temporary backup folder.
     * @private
     */
    async #restoreBindMountSnapshot(snapshot: SnapshotInfo, bindMountPath: string): Promise<void> {
        logger.info(`--- Bind Mount Snapshot Restoration ---`);

        // Step 1: backup existing folder (for rollback)
        const backupPath = path.join(this.#snapshotsDir, `backup-${Date.now()}`);
        logger.info(`Step 1: Creating backup at ${backupPath}...`);
        const t0 = Date.now();
        if (fs.existsSync(bindMountPath)) {
            fs.renameSync(bindMountPath, backupPath);
            logger.info(`✓ Backup created in ${((Date.now() - t0) / 1000).toFixed(2)} seconds`);
        } else {
            logger.info(`No existing data to backup`);
        }

        // Step 2: recreate destination directory
        fs.mkdirSync(bindMountPath, { recursive: true });
        logger.info(`✓ Recreated storage directory`);

        // Capabilities
        const hasBash = await execAsync(`command -v bash >/dev/null 2>&1 && echo yes || echo no`)
            .then((o) => o.stdout.toString().trim() === "yes")
            .catch(() => false);

        logger.info(`Step 2: Restoring snapshot...`);
        const start = Date.now();

        // Periodic size sampler on host (bytes in bindMountPath)
        let sampler: NodeJS.Timeout | null = setInterval(async () => {
            try {
                const { stdout } = await execAsync(`du -sb "${bindMountPath}" 2>/dev/null | cut -f1 || echo 0`);
                const bytes = parseInt(stdout.toString().trim() || "0", 10);
                const mb = (bytes / 1024 / 1024).toFixed(2);
                const secs = ((Date.now() - start) / 1000).toFixed(0);
                logger.info(`Progress: written ~${mb} MB to directory (${secs}s elapsed)`);
            } catch {
                // ignore transient errors while files are being created
            }
        }, 10000);

        try {
            if (snapshot.compressed) {
                // Decompress from file
                const decompressor = `(command -v pigz >/dev/null 2>&1 && pigz -dc "${snapshot.path}" || gunzip -c "${snapshot.path}")`;

                // Host-side tar with verbose for filename counting
                const inner = `${decompressor} | tar xpvf - --no-same-owner -C "${bindMountPath}"`;
                const cmd = hasBash ? `bash -lc 'set -o pipefail; ${inner.replace(/'/g, `'\\''`)}'` : `sh -c '${inner.replace(/'/g, `'\\''`)}'`;

                await new Promise<void>((resolve, reject) => {
                    const child = exec(cmd, { maxBuffer: 1024 * 1024 * 512 });
                    let lineCount = 0;
                    let last500 = 0;
                    let lastTick = Date.now();

                    // Heartbeat: never looks frozen
                    const heartbeat = setInterval(() => {
                        const secs = ((Date.now() - start) / 1000).toFixed(0);
                        logger.info(`Heartbeat: still extracting... ${secs}s elapsed, ~${lineCount} entries`);
                    }, 10000);

                    const onChunk = (chunk: string) => {
                        const lines = chunk
                            .toString()
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean);
                        lineCount += lines.length;

                        if (lineCount - last500 >= 500) {
                            const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                            const rate = ((lineCount / (Date.now() - start)) * 1000).toFixed(1);
                            logger.info(`Extracted ~${lineCount} entries so far (${elapsed}s, ${rate} lines/sec)...`);
                            last500 = lineCount;
                        }

                        const now = Date.now();
                        if (now - lastTick > 15000) {
                            const elapsed = ((now - start) / 1000).toFixed(1);
                            logger.info(`Still extracting... ~${lineCount} entries in ${elapsed}s`);
                            lastTick = now;
                        }
                    };

                    child.stdout?.on("data", onChunk);
                    child.stderr?.on("data", onChunk);

                    child.on("close", (code) => {
                        clearInterval(heartbeat);
                        if (code === 0) {
                            const secs = ((Date.now() - start) / 1000).toFixed(2);
                            logger.info(`✓ Extracted in ${secs} seconds, ~${lineCount} entries logged`);
                            resolve();
                        } else {
                            reject(new Error(`Extraction failed with code ${code}`));
                        }
                    });

                    child.on("error", (err) => {
                        clearInterval(heartbeat);
                        reject(err);
                    });
                });
            } else {
                // Uncompressed snapshot: directory copy or plain .tar
                const st2 = fs.statSync(snapshot.path);
                if (st2.isDirectory()) {
                    logger.info(`Copying uncompressed snapshot directory...`);
                    await this.#copyDirectory(snapshot.path, bindMountPath);
                } else {
                    const tarCmd = `tar xpvf "${snapshot.path}" --no-same-owner -C "${bindMountPath}"`;
                    await new Promise<void>((resolve, reject) => {
                        const child = exec(`sh -c '${tarCmd.replace(/'/g, `'\\''`)}'`, { maxBuffer: 1024 * 1024 * 512 });
                        let fileCount = 0;
                        let lastLog = Date.now();

                        const heartbeat = setInterval(() => {
                            const secs = ((Date.now() - start) / 1000).toFixed(0);
                            logger.info(`Heartbeat: still extracting... ${secs}s elapsed, ~${fileCount} entries`);
                        }, 10000);

                        const onChunk = (chunk: string) => {
                            const lines = chunk
                                .toString()
                                .split("\n")
                                .map((s) => s.trim())
                                .filter(Boolean);
                            fileCount += lines.length;

                            const now = Date.now();
                            if (fileCount > 0 && (fileCount % 500 === 0 || now - lastLog > 5000)) {
                                logger.info(`Extracted ~${fileCount} entries so far...`);
                                lastLog = now;
                            }
                        };

                        child.stdout?.on("data", onChunk);
                        child.stderr?.on("data", onChunk);

                        child.on("close", (code) => {
                            clearInterval(heartbeat);
                            if (code === 0) resolve();
                            else reject(new Error(`tar failed with code ${code}`));
                        });

                        child.on("error", (e) => {
                            clearInterval(heartbeat);
                            reject(e);
                        });
                    });
                }
            }

            logger.info(`✓ Snapshot restored in ${((Date.now() - start) / 1000).toFixed(2)} seconds`);

            // Cleanup backup on success
            if (fs.existsSync(backupPath)) {
                logger.info(`Removing backup...`);
                fs.rmSync(backupPath, { recursive: true, force: true });
                logger.info(`✓ Backup removed`);
            }
        } catch (error) {
            logger.error(`Restore failed, rolling back...`);
            if (fs.existsSync(backupPath)) {
                if (fs.existsSync(bindMountPath)) fs.rmSync(bindMountPath, { recursive: true, force: true });
                fs.renameSync(backupPath, bindMountPath);
                logger.info(`✓ Rolled back to backup`);
            }
            throw error;
        } finally {
            if (sampler) {
                clearInterval(sampler);
                sampler = null;
            } // ensure sampler is stopped
        }

        logger.info(`✓ Restored snapshot to ${bindMountPath}`);
    }

    /**
     * Deletes a snapshot from disk.
     * @param snapshotId - ID of the snapshot to delete
     */
    async deleteSnapshot(snapshotId: string): Promise<void> {
        logger.info(`=== Deleting snapshot: ${snapshotId} ===`);

        const snapshot = this.listSnapshots().find((s) => s.id === snapshotId);
        if (!snapshot) {
            const error = `Snapshot not found: ${snapshotId}`;
            logger.error(error);
            throw new Error(error);
        }

        logger.info(`Snapshot path: ${snapshot.path}`);
        logger.info(`Snapshot size: ${(snapshot.size / 1024 / 1024).toFixed(2)} MB`);

        try {
            const deleteStartTime = Date.now();

            if (fs.existsSync(snapshot.path)) {
                fs.rmSync(snapshot.path, { recursive: true, force: true });
                const deleteDuration = ((Date.now() - deleteStartTime) / 1000).toFixed(2);
                logger.info(`✓ Snapshot deleted in ${deleteDuration} seconds`);
            } else {
                logger.warn(`Snapshot path does not exist: ${snapshot.path}`);
            }

            logger.info(`=== Snapshot deleted successfully: ${snapshotId} ===`);
        } catch (error) {
            logger.error(`Failed to delete snapshot: ${error}`);
            logger.error(`Error details: ${JSON.stringify(error, null, 2)}`);
            throw error;
        }
    }

    /**
     * Lists all available snapshots.
     * @returns Array of snapshot information objects
     */
    listSnapshots(): SnapshotInfo[] {
        if (!fs.existsSync(this.#snapshotsDir)) {
            return [];
        }

        const entries = fs.readdirSync(this.#snapshotsDir);
        const snapshots: SnapshotInfo[] = [];

        for (const entry of entries) {
            const fullPath = path.join(this.#snapshotsDir, entry);

            // Skip backup files
            if (entry.startsWith("backup-")) continue;

            // Check if entry is a compressed file (.tar.gz) or a directory
            const stats = fs.statSync(fullPath);
            let isCompressed = false;
            let id = entry;

            if (stats.isDirectory()) {
                // For directories, check if they contain a compressed tar
                const compressedTar = path.join(fullPath, "data.tar.gz");
                isCompressed = fs.existsSync(compressedTar);
                id = entry;
            } else {
                // For files, check if filename ends with .tar.gz
                isCompressed = entry.endsWith(".tar.gz");
                id = isCompressed ? entry.replace(".tar.gz", "") : entry;
            }

            // Extract timestamp and name from ID
            const match = id.match(/^(\d+)-(.+)$/);
            if (!match) continue;

            const timestamp = parseInt(match[1]);
            const name = match[2].replace(/_/g, " ");

            // Calculate actual size based on snapshot type
            let size = 0;
            if (stats.isDirectory()) {
                // Look for data.tar.gz or data.tar inside the directory
                const compressedTar = path.join(fullPath, "data.tar.gz");
                const uncompressedTar = path.join(fullPath, "data.tar");

                if (fs.existsSync(compressedTar)) {
                    size = fs.statSync(compressedTar).size;
                } else if (fs.existsSync(uncompressedTar)) {
                    size = fs.statSync(uncompressedTar).size;
                } else {
                    // Fallback: calculate total size of all files in directory
                    size = this.#calculateDirectorySize(fullPath);
                }
            } else {
                // For file-based snapshots, use file size directly
                size = stats.size;
            }

            snapshots.push({
                id,
                name,
                timestamp,
                size,
                compressed: isCompressed,
                path: fullPath,
            });
        }

        // Sort by timestamp descending (newest first)
        return snapshots.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Calculates the total size of all files in a directory recursively.
     * @private
     */
    #calculateDirectorySize(dirPath: string): number {
        let totalSize = 0;

        const calculateRecursive = (currentPath: string) => {
            const stats = fs.statSync(currentPath);

            if (stats.isDirectory()) {
                const entries = fs.readdirSync(currentPath);
                entries.forEach((entry) => {
                    calculateRecursive(path.join(currentPath, entry));
                });
            } else {
                totalSize += stats.size;
            }
        };

        calculateRecursive(dirPath);
        return totalSize;
    }

    async #copyDirectory(src: string, dest: string): Promise<void> {
        let fileCount = 0;

        const copyRecursive = (srcPath: string, destPath: string) => {
            const stats = fs.statSync(srcPath);

            if (stats.isDirectory()) {
                if (!fs.existsSync(destPath)) {
                    fs.mkdirSync(destPath, { recursive: true });
                }

                const entries = fs.readdirSync(srcPath);
                logger.info(`Copying directory ${srcPath} (${entries.length} entries)...`);

                entries.forEach((entry) => {
                    const srcEntry = path.join(srcPath, entry);
                    const destEntry = path.join(destPath, entry);
                    copyRecursive(srcEntry, destEntry);
                });
            } else {
                fs.copyFileSync(srcPath, destPath);
                fileCount++;

                // Log every 100 files not to spam logs
                if (fileCount % 100 === 0) {
                    logger.info(`Copied ${fileCount} files so far...`);
                }
            }
        };

        logger.info(`Starting recursive copy from ${src} to ${dest}...`);
        copyRecursive(src, dest);
        logger.info(`Finished copying ${fileCount} total files`);
    }

    async #enforceSnapshotLimit(): Promise<void> {
        const snapshots = this.listSnapshots();
        const maxCount = this.#wbConfig.config.snapshotMaxCount;

        if (snapshots.length > maxCount) {
            const toDelete = snapshots.slice(maxCount);
            logger.info(`Enforcing snapshot limit: deleting ${toDelete.length} old snapshots`);

            for (const snapshot of toDelete) {
                await this.deleteSnapshot(snapshot.id);
            }
        }
    }

    // --- Helpers ---

    /**
     * Check if a command is available in PATH.
     * @private
     */
    async #hasCmd(cmd: string): Promise<boolean> {
        try {
            await execAsync(`command -v ${cmd} >/dev/null 2>&1`);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Run a shell pipeline (e.g., `tar | pigz > file`) and emit progress logs.
     * - Counts files by reading verbose `tar` output (stdout/stderr).
     * - Emits a heartbeat every 10 seconds to avoid "silent" periods.
     * - Logs total duration and entries processed.
     * @private
     */
    async #runPipelineWithProgress(cmd: string, context: string): Promise<void> {
        logger.info(`[${context}] run: ${cmd}`);
        await new Promise<void>((resolve, reject) => {
            const start = Date.now();
            const child = exec(cmd, { maxBuffer: 1024 * 1024 * 512 });
            let files = 0;
            let lastBatch = 0;

            const heartbeat = setInterval(() => {
                const secs = ((Date.now() - start) / 1000).toFixed(0);
                logger.info(`[${context}] Heartbeat: still running... ${secs}s elapsed, ~${files} entries`);
            }, 10000);

            const onChunk = (buf: string) => {
                // tar -v prints one file per line; count non-empty lines
                const n = buf
                    .toString()
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean).length;
                files += n;

                if (files - lastBatch >= 500) {
                    const secs = ((Date.now() - start) / 1000).toFixed(1);
                    logger.info(`[${context}] Processed ~${files} entries so far (${secs}s)`);
                    lastBatch = files;
                }
            };

            child.stdout?.on("data", onChunk);
            child.stderr?.on("data", onChunk);

            child.on("close", (code) => {
                clearInterval(heartbeat);
                if (code === 0) {
                    const secs = ((Date.now() - start) / 1000).toFixed(2);
                    logger.info(`[${context}] ✓ Pipeline completed in ${secs}s (~${files} entries)`);
                    resolve();
                } else {
                    reject(new Error(`[${context}] pipeline exited with code ${code}`));
                }
            });

            child.on("error", (e) => {
                clearInterval(heartbeat);
                logger.error(`[${context}] pipeline error: ${e.message}`);
                reject(e);
            });
        });
    }

    /**
     * Periodically samples the size of a growing file and logs progress & speed.
     * - Checks every 5s; logs MB written, elapsed seconds, and MB/s since last tick.
     * - Returns a function to stop the sampler.
     * @private
     */
    #startFileSizeSampler(filePath: string, context: string): () => void {
        let lastSize = 0;
        let lastTs = Date.now();
        const timer = setInterval(() => {
            try {
                if (fs.existsSync(filePath)) {
                    const st = fs.statSync(filePath);
                    const now = Date.now();
                    const deltaBytes = st.size - lastSize;
                    const deltaSecs = Math.max(0.001, (now - lastTs) / 1000);
                    const rateMBs = deltaBytes / 1024 / 1024 / deltaSecs;
                    logger.info(`[${context}] Progress: ${(st.size / 1024 / 1024).toFixed(2)} MB written; ~${rateMBs.toFixed(2)} MB/s`);
                    lastSize = st.size;
                    lastTs = now;
                } else {
                    logger.info(`[${context}] Waiting for file to appear...`);
                }
            } catch (e) {
                logger.warn(`[${context}] sampler error: ${(e as Error).message}`);
            }
        }, 5000);
        return () => clearInterval(timer);
    }

    /**
     * Emits a heartbeat every 10s to indicate the task is still running.
     * - Useful when underlying command is mostly silent.
     * - Returns a function to stop the heartbeat.
     * @private
     */
    #startHeartbeat(context: string): () => void {
        const start = Date.now();
        const t = setInterval(() => {
            const secs = ((Date.now() - start) / 1000).toFixed(0);
            logger.info(`[${context}] Heartbeat: still working... ${secs}s elapsed`);
        }, 10000);
        return () => clearInterval(t);
    }
    // --- End helpers ---
}
