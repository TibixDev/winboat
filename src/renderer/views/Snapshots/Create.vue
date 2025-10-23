<template>
  <x-card class="flex flex-col gap-4 p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20">
    <div>
      <div class="flex flex-row gap-2 items-center mb-2">
        <Icon class="inline-flex text-violet-400 size-8" icon="mdi:camera-plus"></Icon>
        <h1 class="my-0 text-lg font-semibold">Create New Snapshot</h1>
      </div>
      <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
        The container will be stopped during snapshot creation
      </p>
    </div>

    <div class="flex gap-2 items-start">
      <x-input v-model="newSnapshotName" placeholder="Snapshot name..." class="flex-1" />

      <!-- Create / Create? button-->
      <x-button
        @click="onCreateClick"
        :disabled="isRestoringSnapshot || Object.keys(creatingSnapshots).length > 0 || !newSnapshotName"
        class="w-28"
      >
        <Icon v-if="isCreatingSnapshot" icon="line-md:loading-loop" class="size-5" />
        <span v-else>{{ confirmCreateState ? "Create?" : "Create" }}</span>
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
        <strong>{{ confirmCreateState.toDelete.map(s => s.name).join(", ") }}</strong>.
      </span>
    </div>

    <!-- soft divider -->
    <div class="h-px bg-white/10" />

    <!-- Snapshots in creation state -->
    <div
      v-for="[id, snapshot] in creatingList"
      :key="id"
      class="flex flex-col p-3 bg-neutral-700/50 rounded-lg border-2 border-violet-400/30"
    >
      <div class="flex items-center justify-between mb-2">
        <div class="flex-1">
          <h2 class="font-semibold flex items-center gap-2">
            <Icon icon="line-md:loading-loop" class="size-5 text-violet-400" />
            {{ snapshot.name }}
            <span class="text-sm text-violet-400">(Creating...)</span>
          </h2>
          <p class="text-sm text-gray-400">{{ formatSize(snapshot.currentSize) }} written</p>
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
            :class="
              cancelConfirmId === id
                ? '!bg-red-600/40 hover:!bg-red-600/50 !text-red-200'
                : '!bg-red-500/20 hover:!bg-red-500/30'
            "
          >
            {{ cancelConfirmId === id ? "Are you sure?" : "Cancel" }}
          </x-button>
        </div>
      </div>
    </div>
    <!-- End: Snapshots in creation state -->
  </x-card>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue";
import {
  // form state
  newSnapshotName,
  confirmCreateState,
  isCreatingSnapshot,
  isRestoringSnapshot,
  creatingSnapshots,
  maxSnapshots,
  onCreateClick,
  cancelCreateConfirm,

  // in-progress list and actions
  creatingList,
  cancelConfirmId,
  dontCancelSnapshot,
  requestCancelSnapshot,
  confirmCancelSnapshot,
  formatSize,
} from "./store";
</script>
