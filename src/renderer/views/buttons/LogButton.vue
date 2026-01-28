<script setup lang="ts">
import { WINBOAT_DIR } from "../../lib/constants";
import LogDialog from "../dialogs/LogDialog.vue";
const fs: typeof import("fs") = require("node:fs");
const path: typeof import("path") = require("node:path");

defineProps({ title: String, dialog: LogDialog, logFile: String, childrenClass: String });
</script>

<template>
    <x-button
        @click="
            dialog!.setTitle(title!!);
            dialog!.setContent(fs.readFileSync(path.join(WINBOAT_DIR, logFile!!), 'utf8'));
            dialog!.showModal();
        "
        :class="childrenClass"
    >
        <x-label>Winboat log (winboat.log)</x-label>
    </x-button>
</template>
