<template>
  <!-- Single container card -->
  <x-card
    class="flex flex-col gap-5 p-4 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20"
  >
    <!-- Title -->
    <div class="flex items-center gap-2">
      <h1 class="my-0 text-xl font-semibold">Configuration</h1>
    </div>

    <!-- soft divider -->
    <div class="h-px bg-white/10"></div>

    <!-- Snapshot Storage Path -->
    <div class="flex flex-row items-start justify-between gap-4">
      <div class="flex-1">
        <div class="flex flex-row gap-2 items-center mb-2">
          <Icon class="inline-flex text-violet-400 size-8" icon="mdi:folder" />
          <h2 class="my-0 text-lg font-semibold">Snapshot Storage Path</h2>
        </div>
        <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
          Directory where VM snapshots are stored
        </p>
        <p class="text-neutral-300 text-sm mt-2">
          Current:
          <code class="bg-neutral-700/50 px-2 py-1 rounded">
            {{ wbConfig.config.snapshotPath || "~/.winboat/snapshots" }}
          </code>
        </p>
      </div>

      <x-button
        @click="showSnapshotPathDialog = true"
        class="!bg-gradient-to-tl from-blue-400/20 to-transparent hover:from-blue-400/30 transition"
      >
        Change
      </x-button>
    </div>

    <!-- Inline Path Dialog -->
    <x-card
      v-if="showSnapshotPathDialog"
      class="flex flex-col gap-4 p-4 my-2 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-900/40 border-2 border-violet-500/30"
    >
      <div class="flex flex-row items-center justify-between">
        <h2 class="text-lg font-semibold text-violet-300">Change Snapshot Storage Path</h2>
        <x-button @click="cancelSnapshotPathChange" class="!bg-transparent !border-0 hover:bg-red-500/20">
          <Icon icon="mdi:close" class="size-6" />
        </x-button>
      </div>

      <div>
        <x-label class="text-sm text-neutral-400 mb-1">Current Path</x-label>
        <code class="block bg-neutral-800/50 px-3 py-2 rounded text-neutral-200">
          {{ wbConfig.config.snapshotPath || "~/.winboat/snapshots" }}
        </code>
      </div>

      <div>
        <x-label class="text-sm text-neutral-400 mb-1">New Path</x-label>
        <x-input
          v-model="newSnapshotPath"
          type="text"
          placeholder="/absolute/path/to/snapshots"
          class="w-full"
          :class="{ 'border-red-500 border-2': snapshotPathError }"
        />

        <!-- Inline errors -->
        <div v-if="snapshotPathError" class="mt-2 flex flex-col gap-1">
          <p class="text-red-400 text-sm flex items-center gap-2">
            <Icon icon="mdi:alert-circle" class="size-5" />
            {{ snapshotPathError }}
          </p>
        </div>

        <!-- Warning about existing snapshots in old location -->
        <div v-if="existingSnapshotsWarning" class="mt-2">
          <p class="text-yellow-400 text-sm flex items-start gap-2">
            <Icon icon="mdi:alert" class="size-5 mt-0.5" />
            <span>{{ existingSnapshotsWarning }}</span>
          </p>
        </div>
      </div>

      <div class="flex flex-row gap-2 justify-end">
        <x-button @click="cancelSnapshotPathChange" class="!bg-neutral-700/50 hover:!bg-neutral-700/70">
          Cancel
        </x-button>
        <x-button
          @click="saveSnapshotPath"
          :disabled="!isValidSnapshotPath || isSavingSnapshotPath"
          class="!bg-gradient-to-tl from-violet-500/30 to-transparent hover:from-violet-500/40"
        >
          <span v-if="!isSavingSnapshotPath">Save</span>
          <x-throbber v-else class="w-6" />
        </x-button>
      </div>
    </x-card>

    <!-- soft divider -->
    <div class="h-px bg-white/10"></div>

    <!-- Snapshot limit -->
    <div class="flex flex-row items-center justify-between gap-4">
      <div>
        <div class="flex flex-row gap-2 items-center mb-2">
          <Icon class="inline-flex text-violet-400 size-8" icon="mdi:camera" />
          <h2 class="my-0 text-lg font-semibold">Snapshot Limit</h2>
        </div>
        <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
          Maximum number of snapshots to keep (oldest will be automatically deleted, pay attention not to put a number below your current snapshots count)
        </p>
      </div>

      <div class="flex flex-row gap-2 justify-center items-center">
        <x-input
          v-model.number="wbConfig.config.snapshotMaxCount"
          type="number"
          min="1"
          max="20"
          class="max-w-16 text-right text-[1.1rem]"
        />
      </div>
    </div>

    <!-- soft divider -->
    <div class="h-px bg-white/10"></div>

    <!-- Snapshot compression -->
    <div class="flex flex-row items-center justify-between gap-4">
      <div>
        <div class="flex flex-row gap-2 items-center mb-2">
          <Icon class="inline-flex text-violet-400 size-8" icon="mdi:zip-box" />
          <h2 class="my-0 text-lg font-semibold">Compress Snapshots</h2>
        </div>
        <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
          If enabled, snapshots will be compressed to save disk space
        </p>
      </div>

      <div class="flex flex-row gap-2 justify-center items-center">
        <x-switch
          :toggled="wbConfig.config.snapshotCompression"
          @toggle="() => (wbConfig.config.snapshotCompression = !wbConfig.config.snapshotCompression)"
          size="large"
        />
      </div>
    </div>
  </x-card>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";
import { WinboatConfig } from "../../lib/config";
import { SnapshotManager } from "../../lib/snapshot";
import { WINBOAT_DIR } from "../../lib/constants";

const wbConfig = new WinboatConfig();
// not strictly needed here, but helpful to ensure path existence & re-init
const snapshotManager = new SnapshotManager();

const showSnapshotPathDialog = ref(false);
const newSnapshotPath = ref("");
const snapshotPathError = ref("");
const existingSnapshotsWarning = ref("");
const isSavingSnapshotPath = ref(false);

const isValidSnapshotPath = computed(() => {
  if (!newSnapshotPath.value) return false;

  const path: typeof import("path") = require("path");
  const fs: typeof import("fs") = require("fs");

  snapshotPathError.value = "";
  existingSnapshotsWarning.value = "";

  if (!path.isAbsolute(newSnapshotPath.value)) {
    snapshotPathError.value = "Path must be absolute (e.g., /home/user/snapshots)";
    return false;
  }

  try {
    if (fs.existsSync(newSnapshotPath.value)) {
      fs.accessSync(newSnapshotPath.value, fs.constants.W_OK);
    } else {
      const parent = path.dirname(newSnapshotPath.value);
      if (!fs.existsSync(parent)) {
        snapshotPathError.value = `Parent directory does not exist: ${parent}`;
        return false;
      }
      fs.accessSync(parent, fs.constants.W_OK);
    }
  } catch (e: any) {
    snapshotPathError.value = `Path is not writable: ${e.message}`;
    return false;
  }

  // warn if old location contains snapshots
  const oldPath = wbConfig.config.snapshotPath || require("path").join(WINBOAT_DIR, "snapshots");
  if (require("fs").existsSync(oldPath)) {
    try {
      const files = require("fs").readdirSync(oldPath);
      const count = files.filter((f: string) => !f.startsWith("backup-")).length;
      if (count > 0) {
        existingSnapshotsWarning.value =
          `${count} existing snapshot(s) found in old location. They will not be automatically migrated.`;
      }
    } catch {
      /* ignore */
    }
  }

  return true;
});

function cancelSnapshotPathChange() {
  showSnapshotPathDialog.value = false;
  newSnapshotPath.value = "";
  snapshotPathError.value = "";
  existingSnapshotsWarning.value = "";
}

async function saveSnapshotPath() {
  if (!isValidSnapshotPath.value) return;

  const fs: typeof import("fs") = require("fs");
  try {
    isSavingSnapshotPath.value = true;

    if (!fs.existsSync(newSnapshotPath.value)) {
      fs.mkdirSync(newSnapshotPath.value, { recursive: true });
    }
    fs.accessSync(newSnapshotPath.value, fs.constants.W_OK);

    // write to config (persists)
    wbConfig.config.snapshotPath = newSnapshotPath.value;

    // re-create manager so future ops pick the new path
    // (also validates path structure if manager expects it)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _mgr = new SnapshotManager();

    cancelSnapshotPathChange();
  } catch (e: any) {
    snapshotPathError.value = `Failed to save: ${e.message}`;
  } finally {
    isSavingSnapshotPath.value = false;
  }
}
</script>
