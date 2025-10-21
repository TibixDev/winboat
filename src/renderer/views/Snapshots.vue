<template>
    <div class="flex flex-col gap-10 overflow-x-hidden">
        <div>
            <x-label class="mb-4 text-neutral-300">Snapshot Management</x-label>
            <div class="flex flex-col gap-4">
                <!-- Create New Snapshot -->
                <x-card class="flex flex-col gap-4 p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20">
                    <div>
                        <div class="flex flex-row gap-2 items-center mb-2">
                            <Icon class="inline-flex text-violet-400 size-8" icon="mdi:camera-plus"></Icon>
                            <h1 class="my-0 text-lg font-semibold">
                                Create New Snapshot
                            </h1>
                        </div>
                        <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
                            The container will be stopped during snapshot creation
                        </p>
                    </div>

                    <div class="flex gap-2 items-start">
                      <x-input
                        v-model="newSnapshotName"
                        placeholder="Snapshot name..."
                        class="flex-1"
                      />

                      <!-- Create / Create? button-->
                      <x-button
                        @click="onCreateClick"
                        :disabled="isRestoringSnapshot || Object.keys(creatingSnapshots).length > 0 || !newSnapshotName"
                        class="w-28"
                      >
                        <Icon v-if="isCreatingSnapshot" icon="line-md:loading-loop" class="size-5" />
                        <span v-else>{{ confirmCreateState ? 'Create?' : 'Create' }}</span>
                      </x-button>

                      <!-- Cancel in confirming mode -->
                      <x-button
                        v-if="confirmCreateState"
                        @click="cancelCreateConfirm"
                        class="!bg-neutral-500/20 hover:!bg-neutral-500/30"
                      >
                        Cancel
                      </x-button>
                    </div>

                    <!-- Limit warning -->
                    <div v-if="confirmCreateState" class="flex items-start gap-2 text-amber-300 text-sm mt-1">
                      <Icon icon="mdi:alert" class="size-4 mt-0.5" />
                      <span>
                        Snapshot limit reached (max {{ maxSnapshots }}). Oldest one will get deleted:
                        <strong>{{ confirmCreateState.toDelete.map(s => s.name).join(', ') }}</strong>.
                      </span>
                    </div>
                </x-card>

                <!-- Snapshot List -->
                <x-card class="flex flex-col gap-2 p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20">

                    <!-- Snapshots in creation state -->
                    <div
                        v-for="([id, snapshot]) in creatingList"
                        :key="id"
                        class="flex flex-col p-3 bg-neutral-700/50 rounded-lg mb-2 border-2 border-violet-400/30"
                    >
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex-1">
                                <h2 class="font-semibold flex items-center gap-2">
                                    <Icon icon="line-md:loading-loop" class="size-5 text-violet-400" />
                                    {{ snapshot.name }}
                                    <span class="text-sm text-violet-400">(Creating...)</span>
                                </h2>
                                <p class="text-sm text-gray-400">
                                    {{ formatSize(snapshot.currentSize) }} written
                                </p>
                            </div>
                            <div class="flex gap-2">
                                <x-button
                                    v-if="cancelConfirmId === id"
                                    @click="dontCancelSnapshot()"
                                    class="!bg-neutral-500/20 hover:!bg-neutral-500/30"
                                >
                                    Don't Cancel
                                </x-button>
                                <x-button
                                    @click="cancelConfirmId === id ? confirmCancelSnapshot(id) : requestCancelSnapshot(id)"
                                    :class="cancelConfirmId === id ? '!bg-red-600/40 hover:!bg-red-600/50 !text-red-200' : '!bg-red-500/20 hover:!bg-red-500/30'"
                                >
                                    {{ cancelConfirmId === id ? 'Are you sure?' : 'Cancel' }}
                                </x-button>
                            </div>
                        </div>
                    </div>

                    <!-- Available Snapshots --->
                    <h1 class="text-lg font-semibold mb-2">Available Snapshots</h1>

                    <div v-if="snapshots.length === 0" class="text-center text-gray-400 py-8">
                        No snapshots available
                    </div>

                    <div
                      v-for="snapshot in snapshots"
                      :key="snapshot.id"
                      class="flex items-center justify-between p-3 bg-neutral-700 rounded-lg mb-2"
                    >
                      <div class="flex-1">
                        <h2 class="font-semibold flex items-center gap-2">
                          {{ snapshot.name }}
                          <!-- State-badge -->
                          <span
                            v-if="restoringId === snapshot.id"
                            class="text-sm text-blue-300 inline-flex items-center gap-1"
                          >
                            <Icon icon="line-md:loading-loop" class="size-4" />
                            Restoring...
                          </span>
                        </h2>
                        <p class="text-sm text-gray-400">
                          {{ formatDate(snapshot.timestamp) }} • {{ formatSize(snapshot.size) }}
                          <span v-if="snapshot.compressed" class="ml-1">(compressed)</span>
                        </p>

                        <!-- Overwrite warning if confirming restore -->
                        <div
                          v-if="restoreConfirmId === snapshot.id"
                          class="mt-2 text-amber-300 text-sm flex items-start gap-2"
                        >
                          <Icon icon="mdi:alert" class="size-4 mt-0.5" />
                          <span>Restoring will overwrite the current state of the VM storage.</span>
                        </div>

                        <!-- Warning for cancel restore-->
                        <div
                          v-if="cancelRestoreConfirmId === snapshot.id"
                          class="mt-2 text-amber-300 text-sm flex items-start gap-2"
                        >
                          <Icon icon="mdi:alert" class="size-4 mt-0.5" />
                          <span>
                            Current restore will be stopped and the VM state will be rolled back.
                          </span>
                        </div>
                      </div>

                      <div class="flex gap-2">
                        <!-- Case: Snapshot in restore. During restore, restoring snapshot will show only cancel or confirm -->
                        <template v-if="restoringId === snapshot.id">
                          <template v-if="cancelRestoreConfirmId === snapshot.id">
                            <x-button
                              @click="cancelRestoreSnapshot(snapshot.id)"
                              class="!bg-red-600/40 hover:!bg-red-600/50 !text-red-100"
                            >
                              Cancel restore?
                            </x-button>
                            <x-button
                              @click="keepRestoring"
                              class="!bg-neutral-500/20 hover:!bg-neutral-500/30"
                            >
                              Keep restoring
                            </x-button>
                          </template>
                          <template v-else>
                            <x-button
                              @click="cancelRestoreSnapshot(snapshot.id)"
                              class="!bg-red-600/30 hover:!bg-red-600/40 !text-red-100"
                            >
                              Cancel Restore
                            </x-button>
                          </template>
                        </template>

                        <!-- Case: snapshot not in respore -->
                        <template v-else>
                          <!-- Show restore only if not confirming delete on this snapshot -->
                          <template v-if="restoreConfirmId !== snapshot.id && deleteConfirmId !== snapshot.id">
                            <x-button
                              @click="requestRestoreSnapshot(snapshot.id)"
                              :disabled="isRestoringSnapshot || Object.keys(creatingSnapshots).length > 0 || isDeletingSnapshot"
                              class="!bg-gradient-to-tl from-blue-400/20 to-transparent hover:from-blue-400/30 transition !border-0"
                            >
                              Restore
                            </x-button>
                          </template>

                          <!-- Confirming restore (hide delete)-->
                          <template v-if="restoreConfirmId === snapshot.id">
                            <x-button
                              @click="confirmRestoreSnapshot(snapshot.id)"
                              :disabled="isRestoringSnapshot || Object.keys(creatingSnapshots).length > 0"
                              class="!bg-blue-600/40 hover:!bg-blue-600/50 !text-blue-100"
                            >
                              Restore?
                            </x-button>
                            <x-button
                              @click="dontRestoreSnapshot()"
                              class="!bg-neutral-500/20 hover:!bg-neutral-500/30"
                            >
                              Cancel
                            </x-button>
                          </template>

                          <!-- Delete with double step. Hidden when in confirming restore on this snapshot -->
                          <template v-if="deleteConfirmId === snapshot.id">
                            <x-button
                              @click="confirmDeleteSnapshot(snapshot.id)"
                              :disabled="isDeletingSnapshot || isRestoringSnapshot"
                              class="!bg-red-600/40 hover:!bg-red-600/50 !text-red-200"
                            >
                              Delete?
                            </x-button>
                            <x-button
                              @click="dontDeleteSnapshot()"
                              class="!bg-neutral-500/20 hover:!bg-neutral-500/30"
                            >
                              Cancel
                            </x-button>
                          </template>
                          <template v-else-if="restoreConfirmId !== snapshot.id">
                            <x-button
                              @click="requestDeleteSnapshot(snapshot.id)"
                              :disabled="isDeletingSnapshot || isRestoringSnapshot"
                              class="!bg-gradient-to-tl from-red-500/20 to-transparent hover:from-red-500/30 transition !border-0"
                            >
                              Delete
                            </x-button>
                          </template>
                        </template>
                      </div>
                    </div>
                </x-card>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { Icon } from '@iconify/vue';
import { Winboat } from '../lib/winboat';
import { SnapshotManager } from '../lib/snapshot';
import type { SnapshotInfo } from '../../types';
import { WinboatConfig } from '../lib/config';

interface SnapshotInProgress {
    name: string;
    timestamp: number;
    currentSize: number;
    containerId?: string;
}

const winboat = new Winboat();
const snapshotManager = new SnapshotManager();
const wbConfig = new WinboatConfig();

const snapshots = ref<SnapshotInfo[]>([]);
const newSnapshotName = ref('');
const isCreatingSnapshot = ref(false);
const isRestoringSnapshot = ref(false);
const isDeletingSnapshot = ref(false);
const creatingSnapshots = ref<Record<string, SnapshotInProgress>>({});
const abortController = ref<AbortController | null>(null);
const cancelConfirmId = ref<string | null>(null);
const deleteConfirmId = ref<string | null>(null);
const restoreConfirmId = ref<string | null>(null);
const restoringId = ref<string | null>(null);
const restoreAbortController = ref<AbortController | null>(null);
const confirmCreateState = ref<{ toDelete: SnapshotInfo[] } | null>(null);
const cancelRestoreConfirmId = ref<string | null>(null);
const maxSnapshots = computed(() => {
  const cfg = new WinboatConfig();
  return cfg.config.snapshotMaxCount ?? 2; // Fallback
});

let progressUpdateInterval: NodeJS.Timeout | null = null;  // Interval for polling progress
let isAlive = true; // Track component liveness to prevent updates after unmount
let reloadHandle: number | null = null; // Debounce handle for safe reloads

// Compute entries once per reactive change (avoid recomputing Object.entries in the template)
const creatingList = computed(() => Object.entries(creatingSnapshots.value));

onMounted(async () => {
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
      const prev = creatingSnapshots.value[id] || { name: id.split('-').slice(1).join('-'), timestamp: Number(id.split('-')[0]), currentSize: 0 };
      creatingSnapshots.value = {
        ...creatingSnapshots.value,
        [id]: { ...prev, currentSize: bytes }
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
    console.error('Error in onMounted:', error);
    creatingSnapshots.value = {};
    snapshots.value = [];
  }
});

// Cleanup when navigating away to avoid frozen UI due to live timers/listeners
onBeforeUnmount(() => {
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
});

function preflightDeletionForNewSnapshot(): SnapshotInfo[] {
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

function requestRestoreSnapshot(id: string) {
  // entra in modalità "Restore?"
  restoreConfirmId.value = id;
}

function dontRestoreSnapshot() {
  restoreConfirmId.value = null;
}

async function confirmRestoreSnapshot(snapshotId: string) {
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
    console.error('Error restoring snapshot:', error);
  } finally {
    isRestoringSnapshot.value = false;
    restoringId.value = null;
    restoreAbortController.value = null;
  }
}

function cancelRestoreSnapshot(snapshotId: string) {
  // On first click enter confirm mode
  if (cancelRestoreConfirmId.value !== snapshotId) {
    cancelRestoreConfirmId.value = snapshotId;
    return;
  }

  // On second click, abort restore using cancel snapshot API
  try {
    snapshotManager.cancelCurrentSnapshot(snapshotId);
  } catch (e) {
    console.warn('cancelCurrentSnapshot failed during restore:', e);
  } finally {
    isRestoringSnapshot.value = false;
    restoringId.value = null;
    restoreAbortController.value = null;
    cancelRestoreConfirmId.value = null;
    safeReloadSnapshots(150);
  }
}

function keepRestoring() {
  cancelRestoreConfirmId.value = null;
}

/** Click on main create button */
async function onCreateClick() {
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

function cancelCreateConfirm() {
  confirmCreateState.value = null;
}

function loadSnapshots() {
  try {
    console.log('Loading snapshots...');

    // Always use a fresh SnapshotManager
    const allSnapshots = snapshotManager.listSnapshots();
    console.log('All snapshots from manager:', allSnapshots);

    // Show in "Available" everything that does not have the marker .in-progress
    snapshots.value = allSnapshots.filter(snapshot => {
      const hasMarker = snapshotManager.isSnapshotInProgress(snapshot.id);
      console.log(`Snapshot ${snapshot.id}: hasMarker=${hasMarker}`);
      return !hasMarker;
    });

    console.log('Filtered snapshots:', snapshots.value);
  } catch (error) {
    console.error('Error loading snapshots:', error);
    snapshots.value = [];
  }
}

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
      console.warn('Polling read failed, stopping:', e);
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
        name: prev.name || snap.name || id.split('-').slice(1).join('-'),
        timestamp: prev.timestamp || snap.timestamp || Number(id.split('-')[0]),
        currentSize: snap.currentSize || 0,
        containerId: snap.containerId
      };
    }
    creatingSnapshots.value = merged;
  }, 1000); // 1s
}

// Stop polling
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
                currentSize: 0
            }
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
                            containerId: existingContainerId
                        }
                    };
                }
            },
            abortController.value.signal,
            tempId
        );

        // Remove from creating state BEFORE loading snapshots
        const { [tempId]: removed, ...rest } = creatingSnapshots.value;
        creatingSnapshots.value = rest;
        wbConfig.config.snapshotsInProgress = { ...rest };

        // Now load snapshots - won't show duplicate
        loadSnapshots();

        newSnapshotName.value = '';
        await winboat.startContainer();
    } catch (error) {
        console.error('Error creating snapshot:', error);

        // Check if it was a cancellation
        if (error instanceof Error && error.message.includes('cancelled')) {
            console.log('Snapshot creation was cancelled by user');
        }

        // Remove from creating state on error too
        const { [tempId]: removed, ...rest } = creatingSnapshots.value;
        creatingSnapshots.value = rest;
        wbConfig.config.snapshotsInProgress = { ...rest };
    } finally {
        isCreatingSnapshot.value = false;
        abortController.value = null;
        stopProgressPolling();
    }
}

function requestCancelSnapshot(id: string) {
    cancelConfirmId.value = id;
}

function confirmCancelSnapshot(id: string) {
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

function dontCancelSnapshot() {
    cancelConfirmId.value = null;
}

async function restoreSnapshot(snapshotId: string) {
    if (!confirm('Are you sure you want to restore this snapshot? Current state will be overwritten.')) {
        return;
    }

    isRestoringSnapshot.value = true;
    try {
        await winboat.stopContainer();
        const storageInfo = winboat.getStorageInfo();
        await snapshotManager.restoreSnapshot(snapshotId, storageInfo);
        await winboat.startContainer();
    } catch (error) {
        console.error('Error restoring snapshot:', error);
    } finally {
        isRestoringSnapshot.value = false;
    }
}

function requestDeleteSnapshot(id: string) {
    deleteConfirmId.value = id;
}

async function confirmDeleteSnapshot(snapshotId: string) {
    isDeletingSnapshot.value = true;
    try {
        await snapshotManager.deleteSnapshot(snapshotId);
        loadSnapshots();
    } catch (error) {
        console.error('Error deleting snapshot:', error);
    } finally {
        isDeletingSnapshot.value = false;
        deleteConfirmId.value = null;
    }
}

function dontDeleteSnapshot() {
    deleteConfirmId.value = null;
}

function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
}

function formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
}
</script>
