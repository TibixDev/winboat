import { WINBOAT_DIR } from "./constants";
import { WinboatConfig } from "./config";
import { createLogger } from "../utils/log";
import type { SnapshotInfo } from "../../types";

const fs: typeof import("fs") = require("fs");
const path: typeof import("path") = require("path");
const { promisify }: typeof import("util") = require("util");
const { exec, execSync, spawn }: typeof import("child_process") = require("child_process");

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
    #currentSnapshotProcess: import("child_process").ChildProcess | null = null;
    #currentSnapshotContainerId: string | null = null;
    #activeBindMarkerPath: string | null = null;
    #activeBindConfigKey: string | null = null;
    #activeSamplers: Map<string, () => void> = new Map();
    #activeHearts: Map<string, () => void> = new Map();
    #currentAbort: AbortController | null = null;

    constructor() {
        this.#wbConfig = new WinboatConfig();
        this.#snapshotsDir = this.#wbConfig.config.snapshotPath;

        if (!fs.existsSync(this.#snapshotsDir)) {
            fs.mkdirSync(this.#snapshotsDir, { recursive: true });
            logger.info(`Created snapshots directory: ${this.#snapshotsDir}`);
        }
    }

    // === Busy/Lock helpers ===
    #lockPath(): string {
      return path.join(this.#snapshotsDir, '.lock');
    }

    isBusy(): boolean {
      try { return fs.existsSync(this.#lockPath()); } catch { return false; }
    }

    busyReason(): 'snapshot' | 'restore' | 'unknown' | null {
      try {
        if (!fs.existsSync(this.#lockPath())) return null;
        const raw = fs.readFileSync(this.#lockPath(), 'utf8').trim();
        const j = JSON.parse(raw);
        return j?.reason ?? 'unknown';
      } catch { return 'unknown'; }
    }

    anyInProgress(): boolean {
      try {
        if (!fs.existsSync(this.#snapshotsDir)) return this.isBusy();
        const entries = fs.readdirSync(this.#snapshotsDir);
        const hasMarkers = entries.some(e => {
          const dir = path.join(this.#snapshotsDir, e);
          return fs.existsSync(path.join(dir, '.in-progress')) ||
                 fs.existsSync(path.join(dir, '.bind-active'));
        });
        return hasMarkers || this.isBusy();
      } catch { return this.isBusy(); }
    }

    #setBusy(reason: 'snapshot' | 'restore') {
      try {
        fs.mkdirSync(this.#snapshotsDir, { recursive: true });
        fs.writeFileSync(this.#lockPath(), JSON.stringify({ reason, startedAt: Date.now() }));
      } catch {}
    }

    #clearBusy() {
      try { if (fs.existsSync(this.#lockPath())) fs.unlinkSync(this.#lockPath()); } catch {}
    }

    #persistConfig(): void {
      try {
        const cfgPath = path.join(WINBOAT_DIR, 'winboat.config.json');
        fs.writeFileSync(cfgPath, JSON.stringify(this.#wbConfig.config, null, 4));
        logger.info(`[config] persisted -> ${cfgPath}`);
      } catch (e) {
        logger.error(`[config] persist failed: ${(e as Error).message}`);
      }
    }

    /**
     * Reattach sampler/heartbeat for all snapshots with .in-progress.
     * Call onTick(id, bytes) for every step.
     */
    attachToInProgress(onTick?: (id: string, bytes: number) => void) {
      if (!fs.existsSync(this.#snapshotsDir)) return;

      const entries = fs.readdirSync(this.#snapshotsDir);
      for (const entry of entries) {
        const dir = path.join(this.#snapshotsDir, entry);
        const inprog = path.join(dir, '.in-progress');
        if (!fs.existsSync(inprog)) continue; // Only the in-progress ones

        // Avoid duplicates
        if (this.#activeSamplers.has(entry)) continue;

        const gz  = path.join(dir, 'data.tar.gz');
        const tar = path.join(dir, 'data.tar');
        const artifact = fs.existsSync(gz) ? gz : (fs.existsSync(tar) ? tar : null);
        if (!artifact) continue; // Still no file: we'll retry on next mount

        // Start periodic sampler on the file
        const stopSampler = this.#startFileSizeSampler(artifact, `resume.${entry}`, (bytes) => {
          // Update config.currentSize for live polling
          this.#wbConfig.config.snapshotsInProgress = this.#wbConfig.config.snapshotsInProgress || {};
          const rec: any = (this.#wbConfig.config.snapshotsInProgress as any)[entry] || {};
          rec.currentSize = bytes;
          (this.#wbConfig.config.snapshotsInProgress as any)[entry] = rec;
          try { this.#persistConfig(); } catch {}
          onTick && onTick(entry, bytes);
        }, entry);

        // "Smart" heartbeat that tries to finalize when it sees .complete or when the container (if volume) is dead
        const stopHeart = this.#startHeartbeat(`resume.${entry}`);
        const interval = setInterval(async () => {
          try {
            const complete = fs.existsSync(path.join(dir, '.complete'));
            let containerAlive = false;
            const containerId = this.#wbConfig.config.snapshotsInProgress?.[entry]?.containerId;
            if (containerId) {
              try {
                const out = execSync(`docker ps -q -f id=${containerId}`, {encoding:'utf8'}).trim();
                containerAlive = !!out;
              } catch { /* ignore */ }
            }

            // If we have .complete or, for volumes, the container is dead and the file is "stable", finalize
            let stable = false;
            if (artifact && fs.existsSync(artifact)) {
              const s1 = fs.statSync(artifact);
              await new Promise(r => setTimeout(r, 3000));
              const s2 = fs.statSync(artifact);
              stable = (s1.size === s2.size);
            }

            if (complete || (!containerAlive && stable)) {
              // stop timers
              clearInterval(interval);
              stopSampler(); this.#activeSamplers.delete(entry);
              stopHeart();   this.#activeHearts.delete(entry);

              // Remove markers and clean config
              try { fs.existsSync(inprog) && fs.unlinkSync(inprog); } catch {}
              try {
                const bam = path.join(dir, '.bind-active');
                fs.existsSync(bam) && fs.unlinkSync(bam);
              } catch {}
              if (this.#wbConfig.config.snapshotsInProgress?.[entry]) {
                delete (this.#wbConfig.config.snapshotsInProgress as any)[entry].bindActive;
                delete (this.#wbConfig.config.snapshotsInProgress as any)[entry].bindPid;
                delete this.#wbConfig.config.snapshotsInProgress[entry];
                this.#persistConfig();
              }

              logger.info(`Enforcing snapshot limit (max: ${this.#wbConfig.config.snapshotMaxCount}) after resume-finalize...`);
              await this.#enforceSnapshotLimit();
            }
          } catch {
            // best effort
          }
        }, 4000);

        // Record stops
        this.#activeSamplers.set(entry, () => { clearInterval(interval); stopSampler(); });
        this.#activeHearts.set(entry, stopHeart);
      }
    }

    /** Stops all active samplers and heartbeats. */
    detachAllInProgressSamplers() {
      for (const stop of this.#activeSamplers.values()) { try { stop(); } catch {} }
      for (const stop of this.#activeHearts.values())   { try { stop(); } catch {} }
      this.#activeSamplers.clear();
      this.#activeHearts.clear();
    }

    /**
     * Checks if a snapshot is currently being created by looking for a marker file
     */
    isSnapshotInProgress(snapshotId: string): boolean {
        const markerPath = path.join(this.#snapshotsDir, snapshotId, '.in-progress');
        return fs.existsSync(markerPath);
    }

     /**
      * Attempts to reconcile "stuck" snapshots after an ungraceful shutdown.
      * - If a container was used and no longer exists, we validate the output file and either finalize or cleanup.
      * - For bind snapshots (no container), we validate the output file/dir similarly.
      * - If a bind snapshot appears active, we *verify* the PID really belongs to our pipeline and that the artifact is still progressing;
      *   otherwise we treat it as stalled and continue with validation.
      */
     async quickFinalizeCompleted(maxAgeSec = 30): Promise<void> {
       if (!fs.existsSync(this.#snapshotsDir)) return;
       for (const entry of fs.readdirSync(this.#snapshotsDir)) {
         const dir = path.join(this.#snapshotsDir, entry);
         const inprog = path.join(dir, '.in-progress');
         const done   = path.join(dir, '.complete');
         if (!fs.existsSync(inprog) || !fs.existsSync(done)) continue;

         const gz  = path.join(dir, 'data.tar.gz');
         const tar = path.join(dir, 'data.tar');
         const art = fs.existsSync(gz) ? gz : (fs.existsSync(tar) ? tar : null);

         if (art) {
           const st = fs.statSync(art);
           const age = (Date.now() - st.mtimeMs) / 1000;
           if (age < maxAgeSec) continue;
         }

         try { fs.existsSync(inprog) && fs.unlinkSync(inprog); } catch {}
         try { const bam = path.join(dir, '.bind-active'); fs.existsSync(bam) && fs.unlinkSync(bam); } catch {}
         if (this.#wbConfig.config.snapshotsInProgress?.[entry]) {
           delete (this.#wbConfig.config.snapshotsInProgress as any)[entry].bindActive;
           delete (this.#wbConfig.config.snapshotsInProgress as any)[entry].bindPid;
           delete this.#wbConfig.config.snapshotsInProgress[entry];
           this.#persistConfig();
         }
         logger.info(`[fast-finalize] finalized ${entry}`);
       }
       try {
         logger.info(`Enforcing snapshot limit (max: ${this.#wbConfig.config.snapshotMaxCount}) after quick finalize...`);
         await this.#enforceSnapshotLimit();
       } catch (e) {
         logger.warn(`[fast-finalize] enforce failed: ${(e as Error).message}`);
       }
     }

    /**
     * Cancels the current snapshot creation process and removes partial files.
     */
    cancelCurrentSnapshot(snapshotId?: string): void {
        // Immediatly stop everything belonging to effSignal
        try { this.#currentAbort?.abort(); } catch {}
        this.#currentAbort = null;
        try { this.detachAllInProgressSamplers(); } catch {}
        logger.info(`=== cancelCurrentSnapshot called ===`);
        logger.info(`Snapshot ID provided: ${snapshotId ?? 'none'}`);

        // Log the entire config to see what's actually saved
        logger.info(`Current config snapshotsInProgress: ${JSON.stringify(this.#wbConfig.config.snapshotsInProgress, null, 2)}`);

        if (this.#currentSnapshotProcess) {
            logger.info('Found active snapshot process, killing its process group');
            const pid = this.#currentSnapshotProcess.pid;
            if (typeof pid === 'number' && pid > 0) {
              try { process.kill(-pid, 'SIGTERM'); }
              catch { try { process.kill(pid, 'SIGTERM'); } catch {} }
              setTimeout(() => {
                try { process.kill(-pid, 'SIGKILL'); }
                catch { try { process.kill(pid, 'SIGKILL'); } catch {} }
              }, 1500);
            }
            this.#currentSnapshotProcess = null;
            logger.info('✓ Sent signals to process group');
        } else {
            logger.info('No active snapshot process found in #currentSnapshotProcess');
        }

        // Log the private property value
        logger.info(`#currentSnapshotContainerId value: ${this.#currentSnapshotContainerId ?? 'null'}`);

        // Try to get container ID from config if snapshotId is provided
        if (snapshotId && this.#wbConfig.config.snapshotsInProgress?.[snapshotId]) {
            logger.info(`Found snapshot data in config for ID: ${snapshotId}`);
            logger.info(`Snapshot data: ${JSON.stringify(this.#wbConfig.config.snapshotsInProgress[snapshotId], null, 2)}`);

            let containerId = this.#wbConfig.config.snapshotsInProgress[snapshotId].containerId;
            const bindPid: number | undefined = (this.#wbConfig.config.snapshotsInProgress as any)?.[snapshotId]?.bindPid;

            // Logging to distinguish between sources
            if (this.#currentSnapshotContainerId) {
                logger.info(`Using container ID from private property: ${this.#currentSnapshotContainerId}`);
                containerId = this.#currentSnapshotContainerId;
            } else if (containerId) {
                logger.info(`Using container ID from config (page was changed): ${containerId}`);
            } else {
                logger.warn(`No container ID found - neither in private property nor in config for snapshot ${snapshotId}`);
            }

            // If it was a bind snapshot also kill writer process gorup if still alive
            if (typeof bindPid === 'number' && bindPid > 0) {
                logger.info(`Killing bind writer process group: pid=${bindPid}`);
                try { process.kill(-bindPid, 'SIGTERM'); } catch {}
                setTimeout(() => { try { process.kill(-bindPid, 'SIGKILL'); } catch {} }, 1500);
            }

            if (containerId) {
                try {
                    // Check if container exists before trying to kill it
                    const checkCmd = `docker ps -a -q -f id=${containerId}`;
                    logger.info(`Checking if container exists: ${checkCmd}`);
                    const checkResult = execSync(checkCmd, { encoding: 'utf8' }).trim();
                    logger.info(`Container check result: "${checkResult}"`);

                    if (checkResult) {
                        logger.info(`Killing container: ${containerId}`);
                        execSync(`docker kill ${containerId}`, { encoding: 'utf8' });
                        logger.info(`✓ Killed container ${containerId}`);

                        logger.info(`Removing container: ${containerId}`);
                        execSync(`docker rm ${containerId}`, { encoding: 'utf8' });
                        logger.info(`✓ Removed container ${containerId}`);
                    } else {
                        logger.warn(`Container ${containerId} does not exist, skipping kill/remove`);
                    }
                } catch (e) {
                    logger.error(`Error killing/removing container: ${e}`);
                }
            }
        } else {
            logger.warn(`No snapshot data found in config for ID: ${snapshotId ?? 'undefined'}`);
            logger.info(`Available snapshot IDs in config: ${Object.keys(this.#wbConfig.config.snapshotsInProgress ?? {}).join(', ')}`);
        }

       // Remove partial snapshot directory if ID provided
      if (snapshotId) {
          const snapshotPath = path.join(this.#snapshotsDir, snapshotId);
          const inprogMarker = path.join(snapshotPath, '.in-progress');
          const bindMarker   = path.join(snapshotPath, '.bind-active');
          const reason = this.busyReason(); // 'snapshot' | 'restore' | 'unknown' | null
          logger.info(`Cancel reason detected: ${reason ?? 'none'}`);
          logger.info(`Checking snapshot path: ${snapshotPath}`);

          // If we are restoring, don't deltee the snapshot
          if (reason === 'restore') {
              logger.info(`Cancel during restore -> NOT removing source snapshot dir: ${snapshotPath}`);
          } else {
              // During snapshot creation, delete only if partial (marker .in-progress)
              if (fs.existsSync(snapshotPath)) {
                  if (fs.existsSync(inprogMarker) || fs.existsSync(bindMarker)) {
                      logger.info(`Removing partial snapshot directory (has in-progress/bind marker): ${snapshotPath}`);
                      try { fs.rmSync(snapshotPath, { recursive: true, force: true }); logger.info('✓ Removed partial snapshot directory'); }
                      catch (e) { logger.warn(`Failed to remove partial snapshot directory: ${(e as Error).message}`); }
                  } else {
                      logger.info(`Skip delete: directory exists but no in-progress/bind markers -> looks like a completed snapshot`);
                  }
              } else {
                  logger.info(`Partial snapshot directory does not exist: ${snapshotPath}`);
              }
          }

          // Cleaning only if in progress
          if (this.#wbConfig.config.snapshotsInProgress?.[snapshotId]) {
              logger.info(`Removing ${snapshotId} from snapshotsInProgress config`);
              delete this.#wbConfig.config.snapshotsInProgress[snapshotId];
              this.#persistConfig();
              logger.info(`✓ Removed from config. Remaining snapshotsInProgress: ${JSON.stringify(this.#wbConfig.config.snapshotsInProgress)}`);
          } else {
              logger.info(`Snapshot ${snapshotId} not found in snapshotsInProgress config (nothing to remove)`);
          }
      }

       try { this.#clearBusy(); } catch {}

       logger.info(`=== cancelCurrentSnapshot completed ===`);
    }

    /**
     * Creates a cold snapshot of the VM storage.
     * Container must be stopped before calling this method.
     * @param name - Human-readable snapshot name
     * @param storageInfo - Storage type (volume/bind) and path
     * @param onProgress - optional callback receiving bytes written (growing file size)
     * @param signal - optional AbortSignal to cancel creation
     * @param snapshotId - optional precomputed snapshot id (used by the UI to persist across refresh)
     */
    async createSnapshot(
      name: string,
      storageInfo: { type: "volume" | "bind"; path: string },
      onProgress?: (bytesWritten: number) => void,
      signal?: AbortSignal,
      snapshotId?: string
    ): Promise<void> {

      if (this.isBusy()) {
        throw new Error(`Another snapshot/restore is already in progress (${this.busyReason() ?? 'unknown'}).`);
      }
      this.#setBusy('snapshot');

      logger.info(`=== Starting snapshot creation ===`);      logger.info(`Snapshot name: ${name}`);
      logger.info(`Storage type: ${storageInfo.type}`);
      logger.info(`Storage path: ${storageInfo.path}`);

      const timestamp = Date.now();
      const finalSnapshotId = snapshotId || `${timestamp}-${name.replace(/[^a-zA-Z0-9]/g, "_")}`;
      const snapshotPath = path.join(this.#snapshotsDir, finalSnapshotId);

      try {
        // Create snapshot directory
        logger.info(`Creating snapshot directory: ${snapshotPath}`);
        fs.mkdirSync(snapshotPath, { recursive: true });
        logger.info(`✓ Snapshot directory created`);

        // Create marker file to indicate snapshot is in progress
        const markerPath = path.join(snapshotPath, '.in-progress');
        fs.writeFileSync(markerPath, '');
        logger.info(`✓ Created in-progress marker file`);

        // Reserve the slot and delete oldest now if needed
        logger.info(`Preemptive enforce (reserve slot) max=${this.#wbConfig.config.snapshotMaxCount}...`);
        await this.#enforceSnapshotLimit({ countInProgressAsTaken: true, excludeIds: [finalSnapshotId] });

        // AbortController for this run
        const ac = new AbortController();
        this.#currentAbort = ac;
        const effSignal = signal ?? ac.signal;

        if (storageInfo.type === "volume") {
          const outputFile = this.#wbConfig.config.snapshotCompression
            ? `${snapshotPath}/data.tar.gz`
            : `${snapshotPath}/data.tar`;

          logger.info(`Starting volume export to ${outputFile}...`);
          logger.info(`Compression: ${this.#wbConfig.config.snapshotCompression ? "enabled (using pigz)" : "disabled"}`);

          const startTime = Date.now();
          const dockerCmd = this.#wbConfig.config.snapshotCompression
            ? `docker run -d -v ${storageInfo.path}:/source -v ${snapshotPath}:/backup alpine sh -c "apk add --no-cache pigz && tar cvf - -C /source . | pigz > /backup/data.tar.gz"`
            : `docker run -d -v ${storageInfo.path}:/source -v ${snapshotPath}:/backup alpine tar cvf /backup/data.tar -C /source .`;

          logger.info(`Docker command: ${dockerCmd}`);

          const { stdout: containerId } = await execAsync(dockerCmd);
          this.#currentSnapshotContainerId = containerId.trim();
          logger.info(`Started snapshot container: ${this.#currentSnapshotContainerId}`);

          // Persist containerId
          if (!this.#wbConfig.config.snapshotsInProgress) {
            this.#wbConfig.config.snapshotsInProgress = {};
          }
          this.#wbConfig.config.snapshotsInProgress = {
            ...this.#wbConfig.config.snapshotsInProgress,
            [finalSnapshotId]: {
              ...this.#wbConfig.config.snapshotsInProgress[finalSnapshotId],
              containerId: this.#currentSnapshotContainerId
            }
          };

          this.#persistConfig();

          const stopSizeSampler = this.#startFileSizeSampler(outputFile, "snapshot.volume.export", onProgress, finalSnapshotId);
          const stopHeartbeat   = this.#startHeartbeat("snapshot.volume.export");

          await new Promise<void>((resolve, reject) => {
            this.#currentSnapshotProcess = exec(`docker logs -f ${this.#currentSnapshotContainerId}`);
            const proc = this.#currentSnapshotProcess;
            let lineCount = 0;

            const onAbort = () => {
              logger.info('Snapshot creation aborted by user');
              try { proc.kill('SIGTERM'); } catch {}
              stopSizeSampler(); stopHeartbeat();
              reject(new Error('Snapshot creation cancelled'));
            };
            effSignal?.addEventListener('abort', onAbort, { once: true });

            proc.stdout?.on("data", (data: string) => {
              const lines = data.split("\n").filter((l) => l.trim());
              lineCount += lines.length;
              if (lines.length) logger.info(`[snapshot.volume.export] stdout: +${lines.length} lines (total ~${lineCount})`);
            });

            proc.stderr?.on("data", (data: string) => {
              const s = data.toString().trim();
              if (!s.includes("fetch") && !s.includes("OK:")) logger.warn(`Docker stderr: ${s}`);
            });

            proc.on("exit", (code: number) => {
              stopSizeSampler(); stopHeartbeat();
              effSignal?.removeEventListener('abort', onAbort);
              if (code === 0) {
                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                logger.info(`✓ Volume export completed in ${duration} seconds (~${lineCount} lines seen)`);
                resolve();
              } else {
                reject(new Error(`Docker process exited with code ${code}`));
              }
            });

            proc.on("error", (error: Error) => {
              stopSizeSampler(); stopHeartbeat();
              effSignal?.removeEventListener('abort', onAbort);
              logger.error(`Docker process error: ${error.message}`);
              reject(error);
            });
          });

          if (this.#currentSnapshotContainerId) {
            try {
              await execAsync(`docker rm ${this.#currentSnapshotContainerId}`);
              logger.info(`Removed snapshot container: ${this.#currentSnapshotContainerId}`);
              this.#currentSnapshotContainerId = null;
            } catch (e) {
              logger.warn(`Failed to remove container: ${(e as Error).message}`);
            }
          }

          const finalSizeBytes = fs.statSync(outputFile).size;
          logger.info(`Final snapshot size: ${(finalSizeBytes / 1024 / 1024).toFixed(2)} MB`);
          try {
            fs.writeFileSync(path.join(snapshotPath, ".complete"), "");
          } catch {}
        } else {
          // Bind mount snapshot
          logger.info(`Starting directory snapshot from ${storageInfo.path}...`);
          const startTime = Date.now();

          const outputFile = this.#wbConfig.config.snapshotCompression
            ? path.join(snapshotPath, "data.tar.gz")
            : path.join(snapshotPath, "data.tar");

          const stopSizeSampler = this.#startFileSizeSampler(outputFile, "snapshot.bind.export", onProgress, finalSnapshotId);
          const stopHeartbeat   = this.#startHeartbeat("snapshot.bind.export");

          // Mark bind snapshot as active
          const bindActiveMarker = path.join(snapshotPath, '.bind-active');
          try { fs.writeFileSync(bindActiveMarker, ''); } catch {}
          if (!this.#wbConfig.config.snapshotsInProgress) this.#wbConfig.config.snapshotsInProgress = {};
          (this.#wbConfig.config.snapshotsInProgress as any)[finalSnapshotId] = {
            ...(this.#wbConfig.config.snapshotsInProgress as any)[finalSnapshotId],
            bindActive: true
          };

          // pass context to pipeline
          this.#activeBindMarkerPath = bindActiveMarker;
          this.#activeBindConfigKey  = finalSnapshotId;

          // Immediatly stop sampler/heartbeat even on abort signal
          const onAbortImmediate = () => { try { stopSizeSampler(); } catch{} try { stopHeartbeat(); } catch{} };
          effSignal?.addEventListener('abort', onAbortImmediate, { once: true });

          try {
            if (this.#wbConfig.config.snapshotCompression) {
              logger.info(`Creating compressed snapshot at ${outputFile}...`);
              const hasPigz = await this.#hasCmd("pigz");
              const cmd = hasPigz
                ? `(tar --sparse -cf - -C "${storageInfo.path}" . | pigz > "${outputFile}") && sync && touch "${snapshotPath}/.complete"`
                : `(tar --sparse -cf - -C "${storageInfo.path}" . | gzip > "${outputFile}") && sync && touch "${snapshotPath}/.complete"`;
              await this.#runPipelineWithProgress(cmd, "snapshot.bind.compress", { signal: effSignal, attachAsCurrentProcess: true });

              const duration = ((Date.now() - startTime) / 1000).toFixed(2);
              logger.info(`✓ Compressed snapshot created in ${duration} seconds`);
              const finalSizeBytes = fs.statSync(outputFile).size;
              logger.info(`Final snapshot size: ${(finalSizeBytes / 1024 / 1024).toFixed(2)} MB`);
            } else {
              await this.#copyDirectory(storageInfo.path, snapshotPath);
              const duration = ((Date.now() - startTime) / 1000).toFixed(2);
              logger.info(`✓ Directory copy completed in ${duration} seconds`);
              const finalSize = this.#calculateDirectorySize(snapshotPath);
              logger.info(`Final snapshot size: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
              try {
                fs.writeFileSync(path.join(snapshotPath, ".complete"), "");
              } catch {}
            }
          } finally {
            // cleanup sampler + flag/marker
            try { stopSizeSampler(); } catch {}
            try { stopHeartbeat(); } catch {}
            try { effSignal?.removeEventListener('abort', onAbortImmediate); } catch {}
            try { if (fs.existsSync(bindActiveMarker)) fs.unlinkSync(bindActiveMarker); } catch {}
            if (this.#wbConfig.config.snapshotsInProgress?.[finalSnapshotId]) {
              delete (this.#wbConfig.config.snapshotsInProgress as any)[finalSnapshotId].bindActive;
              delete (this.#wbConfig.config.snapshotsInProgress as any)[finalSnapshotId].bindPid;
              this.#persistConfig();
            }
            this.#activeBindMarkerPath = null;
            this.#activeBindConfigKey  = null;
          }
        }

        if (fs.existsSync(markerPath)) {
          fs.unlinkSync(markerPath);
          logger.info(`✓ Removed in-progress marker file`);
        }

        // Enforce snapshot limit and finalize marker
        logger.info(`Enforcing snapshot limit (max: ${this.#wbConfig.config.snapshotMaxCount})...`);
        await this.#enforceSnapshotLimit();

        // Success -> clear bind/entry
        try {
          const bindActiveMarker = path.join(snapshotPath, '.bind-active');
          if (fs.existsSync(bindActiveMarker)) {
            fs.unlinkSync(bindActiveMarker);
            logger.info('✓ Removed bind-active marker (success path)');
          }
        } catch (e) {
          logger.warn(`bind-active cleanup failed: ${(e as Error).message}`);
        }

        if (this.#wbConfig.config.snapshotsInProgress?.[finalSnapshotId]) {
          delete (this.#wbConfig.config.snapshotsInProgress as any)[finalSnapshotId];
          this.#persistConfig();
          logger.info(`✓ Cleaned snapshotsInProgress for ${finalSnapshotId} (success path)`);
        }

        logger.info(`=== Snapshot created successfully: ${finalSnapshotId} ===`);
      } catch (error) {
        logger.error(`=== Snapshot creation failed ===`);
        logger.error(`Error: ${error}`);
        logger.error(`Error details: ${JSON.stringify(error, null, 2)}`);

        // Cleanup failed snapshot directory (also removes marker)
        if (fs.existsSync(snapshotPath)) {
          logger.info(`Cleaning up failed snapshot directory...`);
          fs.rmSync(snapshotPath, { recursive: true, force: true });
        }
        throw error;
      } finally {
        this.#clearBusy();
        this.#currentAbort = null;
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
        if (this.isBusy()) {
          throw new Error(`Another snapshot/restore is already in progress (${this.busyReason() ?? 'unknown'}).`);
        }
        this.#setBusy('restore');

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
        } finally {
          this.#clearBusy();
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

        const pipeline = innerPipeline;
        const shell = hasBash ? 'bash' : 'sh';
        const shellArgs = hasBash
          ? ['-lc', `set -o pipefail; ${pipeline}`]
          : ['-lc', pipeline];

        logger.info(`Step 2: Restoring data from ${tarPath}...`);
        logger.info(`Pipeline: ${pipeline}`);

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

        const stopSampler = () => { if (sampler) { clearInterval(sampler); sampler = null; } };
        this.#activeSamplers.set(`restore.${snapshot.id}`, stopSampler);

        const stopHeart = this.#startHeartbeat(`restore.volume.${snapshot.id}`);
        this.#activeHearts.set(`restore.${snapshot.id}`, stopHeart);

        await new Promise<void>((resolve, reject) => {

            const child = spawn(shell, shellArgs, {
              detached: true,
              stdio: ['ignore', 'pipe', 'pipe'],
              env: process.env
            });

            this.#currentSnapshotProcess = child;
            child.on("close", () => { if (this.#currentSnapshotProcess === child) this.#currentSnapshotProcess = null; });
            child.on("error", () => { if (this.#currentSnapshotProcess === child) this.#currentSnapshotProcess = null; });

            let fileLines = 0;
            let last500 = 0;
            let lastTick = Date.now();

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
                stopSampler();
                stopHeart();
                this.#activeSamplers.delete(`restore.${snapshot.id}`);
                this.#activeHearts.delete(`restore.${snapshot.id}`);
                if (code === 0) {
                    const secs = ((Date.now() - start) / 1000).toFixed(2);
                    logger.info(`✓ Data restored in ${secs} seconds, ~${fileLines} entries logged`);
                    resolve();
                } else {
                    reject(new Error(`Restore process exited with code ${code}`));
                }
            });

            child.on("error", (err) => {
                stopSampler();
                stopHeart();
                this.#activeSamplers.delete(`restore.${snapshot.id}`);
                this.#activeHearts.delete(`restore.${snapshot.id}`);
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

        let tarPath = snapshot.path;
        let isCompressed = snapshot.compressed;

        const st = fs.statSync(snapshot.path);
        if (st.isDirectory()) {
          const gz = path.join(snapshot.path, "data.tar.gz");
          const tar = path.join(snapshot.path, "data.tar");
          if (fs.existsSync(gz)) { tarPath = gz; isCompressed = true; }
          else if (fs.existsSync(tar)) { tarPath = tar; isCompressed = false; }
          else { throw new Error(`No tar file found in snapshot directory: ${snapshot.path}`); }
        }

        logger.info(`Restoring from tar: ${tarPath} (compressed=${isCompressed})`);

        // Step 1: backup existing folder (for rollback)
        const backupPath = path.join(this.#snapshotsDir, `backup-${Date.now()}`);
        logger.info(`Step 1: Creating backup at ${backupPath}...`);
        const t0 = Date.now();
        if (fs.existsSync(bindMountPath)) {
          try {
            fs.renameSync(bindMountPath, backupPath); // fast path
            logger.info(`✓ Backup (rename) in ${((Date.now() - t0) / 1000).toFixed(2)} seconds`);
          } catch (e: any) {
            if (e?.code === 'EXDEV') {
              const tc = Date.now();
              logger.info(`Cross-device rename detected (EXDEV) -> copying directory...`);
              fs.mkdirSync(backupPath, { recursive: true });
              await this.#copyDirectory(bindMountPath, backupPath);
              try { fs.rmSync(bindMountPath, { recursive: true, force: true }); } catch {}
              logger.info(`✓ Backup (copy) in ${((Date.now() - tc) / 1000).toFixed(2)} seconds`);
            } else {
              throw e;
            }
          }
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

        const stopSampler = () => { if (sampler) { clearInterval(sampler); sampler = null; } };
        this.#activeSamplers.set(`restore.${snapshot.id}`, stopSampler);

        try {
            if (isCompressed) {
                // Decompress from file
                const decompressor = isCompressed
                  ? `(command -v pigz >/dev/null 2>&1 && pigz -dc "${tarPath}" || gunzip -c "${tarPath}")`
                  : `cat "${tarPath}"`;

                // Host-side tar with verbose for filename counting
                const pipeline = `${decompressor} | tar --sparse -xpf - --no-same-owner -C "${bindMountPath}"`;
                const shell = hasBash ? 'bash' : 'sh';
                const shellArgs = hasBash
                  ? ['-lc', `set -o pipefail; ${pipeline}`]
                  : ['-lc', pipeline];

                await new Promise<void>((resolve, reject) => {
                  // Process group leader
                  const child = spawn(shell, shellArgs, {
                     detached: true,
                     stdio: ['ignore', 'pipe', 'pipe'],
                     env: process.env
                   });

                  this.#currentSnapshotProcess = child;
                  child.on("close", () => { if (this.#currentSnapshotProcess === child) this.#currentSnapshotProcess = null; });
                  child.on("error", () => { if (this.#currentSnapshotProcess === child) this.#currentSnapshotProcess = null; });

                  let lineCount = 0;
                  let last500 = 0;
                  let lastTick = Date.now();

                  let errTail: string[] = [];
                  let outTail: string[] = [];

                  const stopHeart = this.#startHeartbeat(`restore.bind.${snapshot.id}`);
                  this.#activeHearts.set(`restore.${snapshot.id}`, stopHeart);

                  const onChunk = (chunk: string, isErr = false) => {
                    const s = chunk.toString();
                    const lines = s.split("\n").map((x) => x.trim()).filter(Boolean);
                    lineCount += lines.length;

                    if (isErr) errTail = this.#tailLines(errTail.concat(lines), 120);
                    else outTail = this.#tailLines(outTail.concat(lines), 50);

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

                  child.stdout?.on("data", (c) => onChunk(c, false));
                  child.stderr?.on("data", (c) => onChunk(c, true));

                  child.on("close", (code) => {
                    stopHeart();
                    this.#activeHearts.delete(`restore.${snapshot.id}`);
                    if (code === 0) {
                      const secs = ((Date.now() - start) / 1000).toFixed(2);
                      logger.info(`✓ Extracted in ${secs} seconds, ~${lineCount} entries logged`);
                      resolve();
                      return;
                    }

                    if (errTail.length) {
                      logger.error(`--- tar stderr (tail, ${errTail.length} lines) ---`);
                      for (const l of errTail) logger.error(l);
                      logger.error(`--- end stderr tail ---`);
                    }
                    if (outTail.length) {
                      logger.warn(`--- tar stdout (tail, ${outTail.length} lines) ---`);
                      for (const l of outTail) logger.warn(l);
                      logger.warn(`--- end stdout tail ---`);
                    }

                    const joined = errTail.join("\n");
                    const hint = /No space left on device|ENOSPC/i.test(joined)
                      ? " (hint: possible ENOSPC: not sufficient space or sparse files not recreated"
                      : "";

                    reject(new Error(`Extraction failed with code ${code}. Last stderr lines:\n${joined}${hint}`));
                  });

                  child.on("error", (err) => {
                    stopHeart();
                    this.#activeHearts.delete(`restore.${snapshot.id}`);
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
                  const pipeline = `tar --sparse -xpf "${snapshot.path}" --no-same-owner -C "${bindMountPath}"`;
                  const shell = hasBash ? 'bash' : 'sh';
                  const shellArgs = hasBash
                    ? ['-lc', `set -o pipefail; ${pipeline}`]
                    : ['-lc', pipeline];
                    await new Promise<void>((resolve, reject) => {
                        const child = spawn(shell, shellArgs, {
                          detached: true,
                          stdio: ['ignore', 'pipe', 'pipe'],
                          env: process.env
                        });

                        this.#currentSnapshotProcess = child;
                        child.on("close", () => { if (this.#currentSnapshotProcess === child) this.#currentSnapshotProcess = null; });
                        child.on("error", () => { if (this.#currentSnapshotProcess === child) this.#currentSnapshotProcess = null; });

                        let fileCount = 0;
                        let lastLog = Date.now();

                        const stopHeart = this.#startHeartbeat(`restore.bind.${snapshot.id}`);
                        this.#activeHearts.set(`restore.${snapshot.id}`, stopHeart);


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
                            stopHeart();
                            this.#activeHearts.delete(`restore.${snapshot.id}`);
                            if (code === 0) resolve();
                            else reject(new Error(`tar failed with code ${code}`));
                        });

                        child.on("error", (e) => {
                            stopHeart();
                            this.#activeHearts.delete(`restore.${snapshot.id}`);
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
          // ensure sampler & heartbeat entries are stopped/cleaned
          stopSampler();
          this.#activeSamplers.delete(`restore.${snapshot.id}`);
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

    async #enforceSnapshotLimit(opts?: { countInProgressAsTaken?: boolean; excludeIds?: string[] }): Promise<void> {

      // Dont delete if restoring
      if (this.isBusy() && this.busyReason() === 'restore') {
        logger.info('Skip enforceSnapshotLimit: restore in progress');
        return;
      }

      const maxCount = this.#wbConfig.config.snapshotMaxCount;
      const exclude = new Set(opts?.excludeIds ?? []);

      // All snapshots
      const all = this.listSnapshots();

      // in-progress ID
      const inprogIds = fs.existsSync(this.#snapshotsDir)
        ? fs.readdirSync(this.#snapshotsDir).filter(id => {
            if (exclude.has(id)) return false;
            const inprog = path.join(this.#snapshotsDir, id, '.in-progress');
            return fs.existsSync(inprog);
          })
        : [];

      // Completed (not in-progress)
      const completed = all.filter(s => !this.isSnapshotInProgress(s.id) && !exclude.has(s.id));

      // To reserve a slot, consider in-progress as occupied slot
      const totalTaken = (opts?.countInProgressAsTaken ? inprogIds.length : 0) + completed.length;

      if (totalTaken > maxCount) {
        // How many completed I need to remove to reach the limit?
        const needToDelete = totalTaken - maxCount;

        // Completed is already in order from newest -> delete from the back (the oldest)
        const toDelete = completed.slice(-needToDelete);

        logger.info(`Enforcing snapshot limit: deleting ${toDelete.length} old completed snapshots (reserve=${!!opts?.countInProgressAsTaken})`);
        for (const s of toDelete) {
          try {
            await this.deleteSnapshot(s.id);
          } catch (e) {
            logger.warn(`Failed to delete ${s.id}: ${(e as Error).message}`);
          }
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
     * - Writes a rich .bind-active marker (pid, cmd, artifactPath, snapshotId) to make recovery robust.
     * @private
     */
    async #runPipelineWithProgress(
      cmd: string,
      context: string,
      opts?: { signal?: AbortSignal; attachAsCurrentProcess?: boolean }
    ): Promise<void> {
      logger.info(`[${context}] run: ${cmd}`);
      await new Promise<void>((resolve, reject) => {
        const start = Date.now();
        const child = spawn('bash', ['-lc', cmd], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: process.env
        });
        let files = 0;
        let lastBatch = 0;
        let aborted = false;

        if (opts?.attachAsCurrentProcess) {
          this.#currentSnapshotProcess = child;
        }

        // Try to guess the artifact path from the shell redirection in the command ("> \"...\"")
        let guessedArtifactPath: string | null = null;
        try {
          const m = cmd.match(/>\s*"?([^">]+\.tar(\.gz)?)"?/);
          if (m && m[1]) {
            guessedArtifactPath = m[1];
          }
        } catch { /* ignore */ }

        // If we're in a bind snapshot and we have a marker path, write a JSON payload with more details.
        try {
          if (this.#activeBindMarkerPath) {
            const payload = {
              pid: child.pid,
              startedAt: Date.now(),
              context,
              cmd,
              snapshotId: this.#activeBindConfigKey ?? null,
              artifactPath: guessedArtifactPath
            };
            fs.writeFileSync(this.#activeBindMarkerPath, JSON.stringify(payload));
          }
          if (this.#activeBindConfigKey) {
            const rec: any = (this.#wbConfig.config.snapshotsInProgress ?? {})[this.#activeBindConfigKey] ?? {};
            rec.bindPid = child.pid;
            (this.#wbConfig.config.snapshotsInProgress as any)[this.#activeBindConfigKey] = rec;
            this.#persistConfig();
          }
        } catch (e) {
          logger.warn(`[${context}] cannot persist bind PID/marker JSON: ${(e as Error).message}`);
        }

        const heartbeat = setInterval(() => {
          const secs = ((Date.now() - start) / 1000).toFixed(0);
          logger.info(`[${context}] Heartbeat: still running... ${secs}s elapsed, ~${files} entries`);
        }, 10000);

        const cleanup = () => {
          clearInterval(heartbeat);
          child.stdout?.removeAllListeners();
          child.stderr?.removeAllListeners();
          if (opts?.attachAsCurrentProcess && this.#currentSnapshotProcess === child) {
            this.#currentSnapshotProcess = null;
          }
          // Clear bind context so future runs don't reuse it by mistake
          this.#activeBindMarkerPath = null;
          this.#activeBindConfigKey = null;
        };

        const onAbort = () => {
          if (aborted) return;
          aborted = true;
          logger.info(`[${context}] abort received -> killing pipeline`);
          try {
            const pid = child.pid;
            if (typeof pid === 'number' && pid > 0) {
              //Try to kill process group (POSIX). If it fails, fallback to child only
              try { process.kill(-pid, 'SIGTERM'); }
              catch { try { process.kill(pid, 'SIGTERM'); } catch {} }
            }
          } catch {}
          cleanup();
          reject(new Error('Snapshot creation cancelled'));
        };
        opts?.signal?.addEventListener('abort', onAbort, { once: true });

        const onChunk = (buf: string) => {
          const n = buf.toString().split("\n").map(s => s.trim()).filter(Boolean).length;
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
          opts?.signal?.removeEventListener('abort', onAbort);
          cleanup();
          if (aborted) return; // already rejected on abort
          if (code === 0) {
            const secs = ((Date.now() - start) / 1000).toFixed(2);
            logger.info(`[${context}] ✓ Pipeline completed in ${secs}s (~${files} entries)`);
            resolve();
          } else {
            reject(new Error(`[${context}] pipeline exited with code ${code}`));
          }
        });

        child.on("error", (e) => {
          opts?.signal?.removeEventListener('abort', onAbort);
          cleanup();
          if (aborted) return;
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
     #startFileSizeSampler(
             filePath: string,
             context: string,
             onProgress?: (bytes: number) => void,
             snapshotId?: string
         ): () => void {
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

                    // Call progress callback if provided
                    if (onProgress) {
                        onProgress(st.size);
                    }

                    // Persist on config so recovery does have a real last lastKnownSize
                    if (snapshotId) {
                        this.#wbConfig.config.snapshotsInProgress = this.#wbConfig.config.snapshotsInProgress || {};
                        const cur: any = this.#wbConfig.config.snapshotsInProgress[snapshotId] || {};
                        cur.currentSize = st.size;
                        logger.info(`[${context}] persist currentSize=${st.size} for snapshotId=${snapshotId}`);
                        (this.#wbConfig.config.snapshotsInProgress as any)[snapshotId] = cur;
                        try { this.#persistConfig(); } catch {}
                    }

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

    #tailLines(buf: string[], max = 100): string[] {
      return buf.length <= max ? buf : buf.slice(buf.length - max);
    }
    // --- End helpers ---
}
