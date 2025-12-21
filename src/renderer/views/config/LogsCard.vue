<script setup lang="ts">
import { ref } from "vue";
import LogDialog from "../dialogs/LogDialog.vue";
import { Icon } from "@iconify/vue";
import LogButton from "../buttons/LogButton.vue";

const logDialog = ref<typeof LogDialog | null>(null);
</script>

<template>
    <x-card
        class="flex flex-row justify-between items-center p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20"
    >
        <div>
            <div class="flex flex-row gap-2 items-center mb-2">
                <Icon class="inline-flex text-violet-400 size-8" icon="lucide:file-code"></Icon>
                <h1 class="my-0 text-lg font-semibold">Logs</h1>
            </div>
            <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">Select the log you want to open</p>
        </div>
        <div class="flex flex-row gap-2 justify-center items-center" style="font-size: 0.8125rem">
            <LogButton title="Winboat log (winboat.log)" logFile="winboat.log" :dialog="logDialog!!" />
            <LogButton title="Install log (install.log)" logFile="install.log" :dialog="logDialog!!" />
        </div>
        <LogDialog ref="logDialog"></LogDialog>
    </x-card>
</template>
