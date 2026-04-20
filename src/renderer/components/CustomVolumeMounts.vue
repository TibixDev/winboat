<template>
    <x-card class="flex flex-col p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20">
        <div class="flex flex-row gap-2 items-center mb-2">
            <Icon class="inline-flex text-violet-400 size-8" icon="fluent:folder-add-32-filled"></Icon>
            <h1 class="my-0 text-lg font-semibold">Custom Folder Mounts</h1>
        </div>
        <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0 mb-4">
            Mount additional folders from your Linux filesystem into Windows.
            They appear under <span class="font-mono bg-neutral-700 rounded-md px-1 py-0.5">\\host.lan\Data\&lt;name&gt;</span>
        </p>

        <!-- Existing Mounts List -->
        <TransitionGroup name="mounts" tag="div" class="flex flex-col gap-2 mb-4">
            <x-card
                v-for="(mount, index) in modelValue"
                :key="`${mount.hostPath}-${mount.shareName}`"
                class="flex flex-row justify-between items-center px-3 py-2 m-0 bg-white/5"
                :class="{ 'opacity-50': !mount.enabled }"
            >
                <div class="flex flex-col gap-1 flex-grow min-w-0">
                    <div class="flex flex-row gap-2 items-center text-sm flex-wrap">
                        <span class="text-neutral-300 truncate">{{ mount.hostPath }}</span>
                        <Icon icon="mdi:arrow-right" class="text-neutral-500 size-4 flex-shrink-0" />
                        <span class="text-violet-300">{{ mount.shareName }}</span>
                    </div>
                    <span v-if="mountErrors[index]" class="text-xs text-red-400">
                        {{ mountErrors[index] }}
                    </span>
                </div>
                <div class="flex flex-row gap-2 items-center flex-shrink-0 ml-2">
                    <x-switch
                        :toggled="mount.enabled"
                        @toggle="() => toggleMount(index)"
                        size="small"
                    />
                    <x-button
                        class="!bg-gradient-to-tl from-red-500/20 to-transparent hover:from-red-500/30 transition !border-0"
                        @click="removeMount(index)"
                    >
                        <x-icon href="#remove"></x-icon>
                    </x-button>
                </div>
            </x-card>
        </TransitionGroup>

        <!-- Add New Mount Form -->
        <div v-if="showAddForm" class="flex flex-col gap-3 p-3 bg-neutral-700/30 rounded-lg mb-4">
            <div class="flex flex-col gap-1">
                <label class="text-xs text-neutral-400">Host Path (Linux)</label>
                <div class="flex flex-row gap-2">
                    <x-input
                        type="text"
                        class="!max-w-full flex-grow"
                        :value="newMount.hostPath"
                        @input="(e: any) => newMount.hostPath = e.target.value"
                        placeholder="/mnt/games"
                    />
                    <x-button @click="selectHostPath">Browse</x-button>
                </div>
            </div>
            <div class="flex flex-col gap-1">
                <label class="text-xs text-neutral-400">Share Name (folder name in Windows)</label>
                <x-input
                    type="text"
                    class="!max-w-full"
                    :value="newMount.shareName"
                    @input="(e: any) => newMount.shareName = e.target.value"
                    placeholder="games"
                />
            </div>
            <div v-if="newMountError" class="text-sm text-red-400">
                {{ newMountError }}
            </div>
            <div class="flex flex-row gap-2">
                <x-button @click="cancelAdd">Cancel</x-button>
                <x-button
                    toggled
                    @click="addMount"
                    :disabled="!!newMountError || !newMount.hostPath || !newMount.shareName"
                >
                    Add Mount
                </x-button>
            </div>
        </div>

        <!-- Add Button -->
        <x-button
            v-if="!showAddForm"
            class="!bg-gradient-to-tl from-blue-400/20 shadow-md shadow-blue-950/20 to-transparent hover:from-blue-400/30 transition w-fit"
            @click="showAddForm = true"
        >
            <x-icon href="#add"></x-icon>
            <x-label>Add Folder Mount</x-label>
        </x-button>
    </x-card>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";
import type { CustomVolumeMount } from "../../types";
import { validateHostPath, validateShareName } from "../lib/volumes";

const electron: typeof import("@electron/remote") = require("@electron/remote");

const props = defineProps<{
    modelValue: CustomVolumeMount[];
}>();

const emit = defineEmits<{
    (e: "update:modelValue", value: CustomVolumeMount[]): void;
}>();

const showAddForm = ref(false);
const newMount = ref<CustomVolumeMount>({
    hostPath: "",
    shareName: "",
    enabled: true
});

// Validate existing mounts (host path may have been deleted)
const mountErrors = computed(() => {
    return props.modelValue.map(mount => {
        try {
            validateHostPath(mount.hostPath);
            return null;
        } catch (e) {
            return (e as Error).message;
        }
    });
});

// Validate new mount form
const newMountError = computed(() => {
    if (!newMount.value.hostPath && !newMount.value.shareName) return null;

    if (newMount.value.hostPath) {
        try {
            validateHostPath(newMount.value.hostPath);
        } catch (e) {
            return `Host: ${(e as Error).message}`;
        }
    }

    if (newMount.value.shareName) {
        try {
            validateShareName(newMount.value.shareName);
        } catch (e) {
            return `Share: ${(e as Error).message}`;
        }

        // Check for duplicates
        const isDuplicate = props.modelValue.some(
            m => m.shareName === newMount.value.shareName
        );
        if (isDuplicate) return "Share name already in use";
    }

    return null;
});

function selectHostPath() {
    electron.dialog.showOpenDialog({
        title: "Select Folder to Mount",
        properties: ["openDirectory"]
    }).then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
            newMount.value.hostPath = result.filePaths[0];
            // Auto-suggest share name from folder name
            if (!newMount.value.shareName) {
                const folderName = result.filePaths[0].split("/").pop() || "";
                newMount.value.shareName = folderName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
            }
        }
    });
}

function addMount() {
    if (newMountError.value) return;

    emit("update:modelValue", [...props.modelValue, { ...newMount.value }]);
    cancelAdd();
}

function cancelAdd() {
    newMount.value = { hostPath: "", shareName: "", enabled: true };
    showAddForm.value = false;
}

function removeMount(index: number) {
    emit("update:modelValue", props.modelValue.filter((_, i) => i !== index));
}

function toggleMount(index: number) {
    const updated = [...props.modelValue];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    emit("update:modelValue", updated);
}
</script>

<style scoped>
.mounts-move,
.mounts-enter-active,
.mounts-leave-active {
    transition: all 0.3s ease;
}
.mounts-enter-from,
.mounts-leave-to {
    opacity: 0;
    transform: translateX(20px);
}
.mounts-leave-active {
    position: absolute;
}
</style>
