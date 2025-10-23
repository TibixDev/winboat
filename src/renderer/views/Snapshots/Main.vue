<template>
  <div class="flex flex-col gap-10 overflow-x-hidden">
    <div>
      <x-label class="mb-4 text-neutral-300">Snapshot Management</x-label>
      <div class="flex flex-col gap-4">
        <!-- Create New Snapshot -->
        <Create />

        <!-- Snapshot List -->
        <List />

        <!-- Settings -->
        <Settings />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import Create from "./Create.vue";
import Settings from "./Settings.vue";
import List from "./List.vue";
import { initSnapshotsPage, cleanupSnapshotsPage } from "./store";

onMounted(async () => {
  // 1) Always try to recover first: the manager will decide what is truly active
  await initSnapshotsPage();
});

onBeforeUnmount(() => {
  // Cleanup when navigating away to avoid frozen UI due to live timers/listeners
  cleanupSnapshotsPage();
});
</script>
