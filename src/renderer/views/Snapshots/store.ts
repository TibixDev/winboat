// Centralized singleton store for Snapshots page (state + actions).

import { ref, computed } from "vue";
import { Winboat } from "../../lib/winboat";
import { SnapshotManager } from "../../lib/snapshot";
import type { SnapshotInfo } from "../../../types";
import { WinboatConfig } from "../../lib/config";

export interface SnapshotInProgress {
  name: string;
  timestamp: number;
  currentSize: number;
  containerId?: string;
}

/** === SINGLETONS === */
const winboat = new Winboat();
const snapshotManager = new SnapshotManager();
const wbConfig = new WinboatConfig();

/** === STATE (shared across components) === */
export const snapshots = ref<SnapshotInfo[]>([]);
export const newSnapshotName = ref("");
export const isCreatingSnapshot = ref(false);
export const isRestoringSnapshot = ref(false);
export const isDeletingSnapshot = ref(false);
export const creatingSnapshots = ref<Record<string, SnapshotInProgress>>({});
export const abortController = ref<AbortController | null>(null);
export const cancelConfirmId = ref<string | null>(null);
export const deleteConfirmId = ref<string | null>(null);
export const restoreConfirmId = ref<string | null>(null);
export const restoringId = ref<string | null>(null);
export const restoreAbortController = ref<AbortController | null>(null);
export const confirmCreateState = ref<{ toDelete: SnapshotInfo[] } | null>(null);
export const cancelRestoreConfirmId = ref<string | null>(null);

// Compute entries once per reactive change (avoid recomputing Object.entries in the template)
export const creatingList = computed(() => Object.entries(creatingSnapshots.value));

export const maxSnapshots = computed(() => {
  const cfg = new WinboatConfig();
  return cfg.config.snapshotMaxCount ?? 2; // Fallback
});

let progressUpdateInterval: NodeJS.Timeout | null = null; // Interval for polling progress
let isAlive = true; // Track component liveness to prevent updates after unmount
let reloadHandle: number | null = null; // Debounce handle for safe reloads

/** === LIFECYCLE-LIKE API (to be called in Main.vue) === */
export async function initSnapshotsPage() {
  try {
    // 1) Always try to recover first: the manager will decide what is truly active
    await (snapshotManager as any).quickFinalizeCompleted(30);

    // 2) Read the (potentially cleaned) config AFTER recovery
    const fresh = new WinboatConfig();
    const configSnapshots = fresh.config.snapshotsInProgress || {};
    creatingSnapshots.value = { ...configSnapshots };

    // 2bis) Re-attach to eventual in-progress snapshots in case of app restart
    // Update also local state to give instant reactivity
    (snapshotManager as any).attachToInProgress((id: string, bytes: number) => {
      const prev = creatingSnapshots.value[id] || {
        name: id.split("-").slice(1).join("-"),
        timestamp: Number(id.split("-")[0]),
        currentSize: 0,
      };
      creatingSnapshots.value = {
        ...creatingSnapshots.value,
        [id]: { ...prev, currentSize: bytes },
      };
    });

    // 3) If there are still active "in progress" entries, recreate the abort controller and start polling
    if (Object.keys(creatingSnapshots.value).length > 0) {
      abortController.value = new AbortController();
      startProgressPolling();
    }

    // 4) Finally load and filter visible snapshots (will hide those still truly in progress / with markers)
    loadSnapshots();
  } catch (error) {
    console.error("Error in initSnapshotsPage:", error);
    creatingSnapshots.value = {};
    snapshots.value = [];
  }
}

// Cleanup when navigating away to avoid frozen UI due to live timers/listeners
export function cleanupSnapshotsPage() {
  isAlive = false;
  stopProgressPolling();
  cancelConfirmId.value = null;
  deleteConfirmId.value = null;
  abortController.value = null; // drop reference to avoid leaking listeners
  (snapshotManager as any).detachAllInProgressSamplers();
  if (reloadHandle) {
    clearTimeout(reloadHandle as unknown as number);
    reloadHandle = null;
  }
}

/** === HELPERS === */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/** === CORE === */
export function preflightDeletionForNewSnapshot(): SnapshotInfo[] {
  // Actual List
  const all = snapshotManager.listSnapshots();
  // Consider COMPLETED only
  const completed = all.filter(s => !snapshotManager.isSnapshotInProgress(s.id));

  const willTake = completed.length + 1; // "+1" counting the new one
  const max = maxSnapshots.value;

  if (willTake <= max) return [];

  // How many do I need to delete to fit within the limit?
  const needToDelete = willTake - max;

  // Completed is from newest to oldest -> take the last = the oldest
  return completed.slice(-needToDelete);
}

export function requestRestoreSnapshot(id: string) {
  // enter "Restore?" mode
  restoreConfirmId.value = id;
}

export function dontRestoreSnapshot() {
  restoreConfirmId.value = null;
}

export async function confirmRestoreSnapshot(snapshotId: string) {
  // Start restore with no popup
  restoreConfirmId.value = null;
  isRestoringSnapshot.value = true;
  restoringId.value = snapshotId;

  try {
    await winboat.stopContainer();
    const storageInfo = winboat.getStorageInfo();

    // For later use
    restoreAbortController.value = new AbortController();

    await snapshotManager.restoreSnapshot(snapshotId, storageInfo);

    await winboat.startContainer();
  } catch (error) {
    console.error("Error restoring snapshot:", error);
  } finally {
    isRestoringSnapshot.value = false;
    restoringId.value = null;
    restoreAbortController.value = null;
  }
}

export function cancelRestoreSnapshot(snapshotId: string) {
  // On first click enter confirm mode
  if (cancelRestoreConfirmId.value !== snapshotId) {
    cancelRestoreConfirmId.value = snapshotId;
    return;
  }

  // On second click, abort restore using cancel snapshot API
  try {
    snapshotManager.cancelCurrentSnapshot(snapshotId);
  } catch (e) {
    console.warn("cancelCurrentSnapshot failed during restore:", e);
  } finally {
    isRestoringSnapshot.value = false;
    restoringId.value = null;
    restoreAbortController.value = null;
    cancelRestoreConfirmId.value = null;
    safeReloadSnapshots(150);
  }
}

export function keepRestoring() {
  cancelRestoreConfirmId.value = null;
}

/** Click on main create button */
export async function onCreateClick() {
  if (!confirmCreateState.value) {
    // First press: do preflight
    const toDelete = preflightDeletionForNewSnapshot();
    if (toDelete.length === 0) {
      // Not exceeding -> create immediately
      await createSnapshot();
    } else {
      // Exceeding .> ask confirmation
      confirmCreateState.value = { toDelete };
    }
  } else {
    // Second press (Create?) -> proceed really
    await createSnapshot();
    confirmCreateState.value = null; // reset
  }
}

export function cancelCreateConfirm() {
  confirmCreateState.value = null;
}

export function requestCancelSnapshot(id: string) {
  cancelConfirmId.value = id;
}

export function confirmCancelSnapshot(id: string) {
  if (abortController.value) {
    abortController.value.abort();
  }

  // Call cancelCurrentSnapshot to rm the container
  snapshotManager.cancelCurrentSnapshot(id);

  // Clean up the state
  const { [id]: removed, ...rest } = creatingSnapshots.value;
  creatingSnapshots.value = rest;
  wbConfig.config.snapshotsInProgress = { ...rest };

  cancelConfirmId.value = null;
  stopProgressPolling();

  // Add a small delay to ensure filesystem operations complete
  safeReloadSnapshots(120);
}

export function dontCancelSnapshot() {
  cancelConfirmId.value = null;
}

export function requestDeleteSnapshot(id: string) {
  deleteConfirmId.value = id;
}

export async function confirmDeleteSnapshot(snapshotId: string) {
  isDeletingSnapshot.value = true;
  try {
    await snapshotManager.deleteSnapshot(snapshotId);
    loadSnapshots();
  } catch (error) {
    console.error("Error deleting snapshot:", error);
  } finally {
    isDeletingSnapshot.value = false;
    deleteConfirmId.value = null;
  }
}

export function dontDeleteSnapshot() {
  deleteConfirmId.value = null;
}

/** === INTERNAL (not exported) === */
function startProgressPolling() {
  // Clear any existing interval
  if (progressUpdateInterval) {
    clearInterval(progressUpdateInterval);
  }

  progressUpdateInterval = setInterval(() => {
    // Guard: if component got unmounted, stop immediately
    if (!isAlive) {
      stopProgressPolling();
      return;
    }

    // Recreate WinboatConfig to read from disk
    let freshConfig: WinboatConfig;
    let configSnapshots: Record<string, SnapshotInProgress> = {};
    try {
      freshConfig = new WinboatConfig(); // Read progress from config
      configSnapshots = (freshConfig.config.snapshotsInProgress || {}) as Record<string, SnapshotInProgress>;
    } catch (e) {
      console.warn("Polling read failed, stopping:", e);
      stopProgressPolling();
      return;
    }

    // --- PRUNE STALE ENTRIES ---
    // Remove entries that are no longer present in config AND have no .in-progress marker.
    // This happens after a successful recovery or completion, to avoid UI "Creating..." ghost rows.
    for (const id of Object.keys(creatingSnapshots.value)) {
      const stillInConfig = !!configSnapshots[id];
      const stillHasMarker = snapshotManager.isSnapshotInProgress(id);

      if (!stillInConfig && !stillHasMarker) {
        const { [id]: _removed, ...rest } = creatingSnapshots.value;
        creatingSnapshots.value = rest;

        // If nothing remains, stop polling and reload the available snapshots list
        if (Object.keys(rest).length === 0) {
          stopProgressPolling();
        }
        safeReloadSnapshots(60);
      }
    }

    // If nothing is creating, stop
    if (Object.keys(configSnapshots).length === 0 && Object.keys(creatingSnapshots.value).length === 0) {
      stopProgressPolling();
      return;
    }

    // --- UPDATE LIVE PROGRESS ---
    const merged: Record<string, SnapshotInProgress> = {};
    for (const [id, snap] of Object.entries(configSnapshots)) {
      const prev = creatingSnapshots.value[id] || ({} as SnapshotInProgress);
      merged[id] = {
        name: prev.name || (snap as any).name || id.split("-").slice(1).join("-"),
        timestamp: prev.timestamp || (snap as any).timestamp || Number(id.split("-")[0]),
        currentSize: (snap as any).currentSize || 0,
        containerId: (snap as any).containerId,
      };
    }
    creatingSnapshots.value = merged;
  }, 1000); // 1s
}

function stopProgressPolling() {
  if (progressUpdateInterval) {
    clearInterval(progressUpdateInterval);
    progressUpdateInterval = null;
  }
}

// Debounced reload that respects component liveness
function safeReloadSnapshots(delay = 120) {
  if (reloadHandle) clearTimeout(reloadHandle);
  reloadHandle = setTimeout(() => {
    if (!isAlive) return;
    loadSnapshots();
    reloadHandle = null;
  }, delay) as unknown as number;
}

function loadSnapshots() {
  try {
    // Always use a fresh SnapshotManager
    const allSnapshots = snapshotManager.listSnapshots();

    // Show in "Available" everything that does not have the marker .in-progress
    snapshots.value = allSnapshots.filter(snapshot => !snapshotManager.isSnapshotInProgress(snapshot.id));
  } catch (error) {
    console.error("Error loading snapshots:", error);
    snapshots.value = [];
  }
}

async function createSnapshot() {
  if (!newSnapshotName.value) return;

  const timestamp = Date.now();
  const tempId = `${timestamp}-${newSnapshotName.value.replace(/[^a-zA-Z0-9]/g, "_")}`;

  isCreatingSnapshot.value = true;

  try {
    await winboat.stopContainer();
    const storageInfo = winboat.getStorageInfo();

    // Force reactivity and save to config
    creatingSnapshots.value = {
      ...creatingSnapshots.value,
      [tempId]: {
        name: newSnapshotName.value,
        timestamp: timestamp,
        currentSize: 0,
      },
    };

    safeReloadSnapshots(150);

    abortController.value = new AbortController();

    await snapshotManager.createSnapshot(
      newSnapshotName.value,
      storageInfo,
      (bytesWritten: number) => {
        if (creatingSnapshots.value[tempId]) {
          // Get existing containerId from config before overwriting
          const existingContainerId = wbConfig.config.snapshotsInProgress?.[tempId]?.containerId;

          creatingSnapshots.value = {
            ...creatingSnapshots.value,
            [tempId]: {
              ...creatingSnapshots.value[tempId],
              currentSize: bytesWritten,
              containerId: existingContainerId,
            },
          };
        }
      },
      abortController.value.signal,
      tempId,
    );

    // Remove from creating state BEFORE loading snapshots
    const { [tempId]: _removed, ...rest } = creatingSnapshots.value;
    creatingSnapshots.value = rest;
    wbConfig.config.snapshotsInProgress = { ...rest };

    // Now load snapshots - won't show duplicate
    const allSnapshots = snapshotManager.listSnapshots();
    snapshots.value = allSnapshots.filter(snapshot => !snapshotManager.isSnapshotInProgress(snapshot.id));

    newSnapshotName.value = "";
    await winboat.startContainer();
  } catch (error) {
    console.error("Error creating snapshot:", error);

    // Check if it was a cancellation
    if (error instanceof Error && error.message.includes("cancelled")) {
      console.log("Snapshot creation was cancelled by user");
    }

    // Remove from creating state on error too
    const { [tempId]: _removed, ...rest } = creatingSnapshots.value;
    creatingSnapshots.value = rest;
    wbConfig.config.snapshotsInProgress = { ...rest };
  } finally {
    isCreatingSnapshot.value = false;
    abortController.value = null;
    stopProgressPolling();
  }
}
