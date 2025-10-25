<template>
  <x-card class="flex flex-col gap-2 p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20">
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
          <span v-if="restoringId === snapshot.id" class="text-sm text-blue-300 inline-flex items-center gap-1">
            <Icon icon="line-md:loading-loop" class="size-4" />
            Restoring...
          </span>
        </h2>
        <p class="text-sm text-gray-400">
          {{ formatDate(snapshot.timestamp) }} • {{ formatSize(snapshot.size) }}
          <span v-if="snapshot.compressed" class="ml-1">(compressed)</span>
        </p>

        <!-- Overwrite warning if confirming restore -->
        <div v-if="restoreConfirmId === snapshot.id" class="mt-2 text-amber-300 text-sm flex items-start gap-2">
          <Icon icon="mdi:alert" class="size-4 mt-0.5" />
          <span>Restoring will overwrite the current state of the VM storage.</span>
        </div>

        <!-- Warning for cancel restore -->
        <div v-if="cancelRestoreConfirmId === snapshot.id" class="mt-2 text-amber-300 text-sm flex items-start gap-2">
          <Icon icon="mdi:alert" class="size-4 mt-0.5" />
          <span> Current restore will be stopped and the VM state will be rolled back. </span>
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
            <x-button @click="keepRestoring" class="!bg-neutral-500/20 hover:!bg-neutral-500/30">
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

        <!-- Case: snapshot not in restore -->
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

          <!-- Confirming restore (hide delete) -->
          <template v-if="restoreConfirmId === snapshot.id">
            <x-button
              @click="confirmRestoreSnapshot(snapshot.id)"
              :disabled="isRestoringSnapshot || Object.keys(creatingSnapshots).length > 0"
              class="!bg-blue-600/40 hover:!bg-blue-600/50 !text-blue-100"
            >
              Restore?
            </x-button>
            <x-button @click="dontRestoreSnapshot()" class="!bg-neutral-500/20 hover:!bg-neutral-500/30">Cancel</x-button>
          </template>

          <!-- Delete with double step. Hidden when in confirming restore on this snapshot -->
          <template v-if="deleteConfirmId === snapshot.id">
            <x-button
              @click="dontDeleteSnapshot()"
              class="!bg-neutral-500/20 hover:!bg-neutral-500/30"
            >
              Cancel
            </x-button>
            <x-button
              @click="confirmDeleteSnapshot(snapshot.id)"
              :disabled="isDeletingSnapshot || isRestoringSnapshot"
              class="!bg-red-600/40 hover:!bg-red-600/50 !text-red-200"
            >
              Delete?
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
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue";
import {
  snapshots,
  restoringId,
  restoreConfirmId,
  cancelRestoreConfirmId,
  isRestoringSnapshot,
  isDeletingSnapshot,
  creatingSnapshots,
  requestRestoreSnapshot,
  confirmRestoreSnapshot,
  dontRestoreSnapshot,
  cancelRestoreSnapshot,
  keepRestoring,
  deleteConfirmId,
  requestDeleteSnapshot,
  confirmDeleteSnapshot,
  dontDeleteSnapshot,
  formatDate,
  formatSize,
} from "./store";
</script>
