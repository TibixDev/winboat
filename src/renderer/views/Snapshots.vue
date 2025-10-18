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
                    <div class="flex gap-2">
                        <x-input
                            v-model="newSnapshotName"
                            placeholder="Snapshot name..."
                            class="flex-1"
                        />
                        <x-button
                            @click="createSnapshot"
                            :disabled="!newSnapshotName || isCreatingSnapshot"
                            class="w-24"
                        >
                            <Icon v-if="isCreatingSnapshot" icon="line-md:loading-loop" class="size-5" />
                            <span v-else>Create</span>
                        </x-button>
                    </div>
                </x-card>

                <!-- Snapshot List -->
                <x-card class="flex flex-col gap-2 p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20">
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
                            <h2 class="font-semibold">{{ snapshot.name }}</h2>
                            <p class="text-sm text-gray-400">
                                {{ formatDate(snapshot.timestamp) }} •
                                {{ formatSize(snapshot.size) }}
                                <span v-if="snapshot.compressed" class="ml-1">(compressed)</span>
                            </p>
                        </div>
                        <div class="flex gap-2">
                            <x-button
                                @click="restoreSnapshot(snapshot.id)"
                                :disabled="isRestoringSnapshot"
                                class="!bg-gradient-to-tl from-blue-400/20 to-transparent hover:from-blue-400/30 transition !border-0"
                            >
                                Restore
                            </x-button>
                            <x-button
                                @click="deleteSnapshot(snapshot.id)"
                                :disabled="isDeletingSnapshot"
                                class="!bg-gradient-to-tl from-red-500/20 to-transparent hover:from-red-500/30 transition !border-0"
                            >
                                Delete
                            </x-button>
                        </div>
                    </div>
                </x-card>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { Winboat } from '../lib/winboat';
import { SnapshotManager } from '../lib/snapshot';
import type { SnapshotInfo } from '../../types';

const winboat = new Winboat();
const snapshotManager = new SnapshotManager();

const snapshots = ref<SnapshotInfo[]>([]);
const newSnapshotName = ref('');
const isCreatingSnapshot = ref(false);
const isRestoringSnapshot = ref(false);
const isDeletingSnapshot = ref(false);

onMounted(() => {
    loadSnapshots();
});

function loadSnapshots() {
    snapshots.value = snapshotManager.listSnapshots();
}

async function createSnapshot() {
    if (!newSnapshotName.value) return;

    isCreatingSnapshot.value = true;
    try {
        await winboat.stopContainer();
        const storageInfo = winboat.getStorageInfo();
        await snapshotManager.createSnapshot(newSnapshotName.value, storageInfo);
        loadSnapshots();
        newSnapshotName.value = '';
        await winboat.startContainer();
    } catch (error) {
        console.error('Error creating snapshot:', error);
    } finally {
        isCreatingSnapshot.value = false;
    }
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

async function deleteSnapshot(snapshotId: string) {
    if (!confirm('Are you sure you want to delete this snapshot?')) {
        return;
    }

    isDeletingSnapshot.value = true;
    try {
        await snapshotManager.deleteSnapshot(snapshotId);
        loadSnapshots();
    } catch (error) {
        console.error('Error deleting snapshot:', error);
    } finally {
        isDeletingSnapshot.value = false;
    }
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
