<script setup lang="ts">
import { ref } from "vue";
import { Icon } from "@iconify/vue";
const electron: typeof import("electron") = require("electron");

defineProps({ title: String, content: String });
const dialogRef = ref<HTMLDialogElement | null>(null);
const copied = ref(false);
function showModal() {
    copied.value = false;
    dialogRef.value!.showModal();
}

defineExpose({ showModal });
</script>

<template>
    <dialog ref="dialogRef" @keydown.esc="dialogRef!.close()">
        <div class="flex flex-row gap-2 items-center mb-2">
            <x-box class="flex flex-row gap-2 items-center">
                <Icon icon="lucide:file-code" class="size-[16px]"></Icon>
                <h3 class="mb-0 mt-0 content-center">{{ title }}</h3>
            </x-box>
            <x-button
                id="close"
                value="close"
                skin="flat"
                class="size-[16px] fill-white ml-auto"
                v-on:click="dialogRef!.close()"
            >
                <svg viewBox="0 0 100 100">
                    <path
                        d="M 50 55.57 L 25.59 79.97 C 24.82 80.75 23.87 81.14 22.8 81.14 C 21.71 81.14 20.78 80.75 20.07 79.97 C 19.3 79.19 18.91 78.34 18.91 77.18 C 18.91 76.16 19.3 75.23 20.07 74.45 L 44.48 50.05 L 20.07 25.56 C 19.3 24.78 18.91 23.85 18.91 22.76 C 18.91 22.23 18.98 21.76 19.21 21.28 C 19.45 20.82 19.69 20.36 20.07 20.04 C 20.39 19.65 20.85 19.41 21.32 19.26 C 21.79 19.02 22.26 18.87 22.8 18.87 C 23.87 18.87 24.82 19.26 25.59 20.04 L 50 44.53 L 74.49 20.04 C 75.27 19.26 76.13 18.87 77.2 18.87 C 78.29 18.87 79.22 19.26 80 20.04 C 80.79 20.82 81.09 21.76 81.09 22.83 C 81.09 23.92 80.79 24.78 80 25.56 L 55.52 50.05 L 80 74.45 C 80.79 75.23 81.09 76.16 81.09 77.25 C 81.09 77.78 81.02 78.34 80.79 78.8 C 80.62 79.27 80.31 79.65 79.93 80.04 C 79.61 80.36 79.22 80.66 78.68 80.83 C 78.29 81.05 77.74 81.14 77.2 81.14 C 76.13 81.14 75.27 80.75 74.49 79.97 L 50 55.57 Z"
                    ></path></svg
            ></x-button>
        </div>
        <div class="relative">
            <div class="absolute right-[2%] top-[2%]">
                <x-button
                    @click="
                        electron.clipboard.writeText(content!.toString());
                        copied = true;
                    "
                >
                    <x-box v-if="!copied" class="justify-center">
                        <Icon icon="ci:copy" class="size-[1.125rem] mr-1"></Icon>
                        <x-label>Copy</x-label>
                    </x-box>
                    <x-box v-if="copied">
                        <Icon icon="hugeicons:tick-double-02" class="size-[1.125rem] mr-1 text-green-400"></Icon>
                        <x-label>Copied!</x-label>
                    </x-box>
                </x-button>
            </div>
            <div class="overflow-y-scroll" style="max-height: 60vh; max-width: 90vh">
                <pre
                    class="text-sm text-gray-400 bg-neutral-800 p-4 rounded-lg overflow-auto m-0"
                    ref="logPreElement"
                    >{{ content }}</pre
                >
            </div>
        </div>
    </dialog>
</template>
