<template>
    <div class="flex flex-col gap-10" :class="{ 'hidden': !maxNumCores }">
        <div>
            <x-label class="mb-4 text-neutral-300">Resources</x-label>
            <div class="flex flex-col gap-4">
                <x-card
                    class="flex items-center p-2 flex-row justify-between w-full py-3 my-0 bg-neutral-800/20 backdrop-brightness-150 backdrop-blur-xl">
                    <div>
                        <div class="flex flex-row items-center gap-2 mb-2">
                            <Icon class="text-violet-400 inline-flex size-8" icon="game-icons:ram"></Icon>
                            <h1 class="text-lg my-0 font-semibold">
                                RAM Allocation
                            </h1>
                        </div>
                        <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
                            How many gigabytes of RAM are allocated to the Windows virtual machine
                        </p>
                    </div>
                    <div class="flex flex-row justify-center items-center gap-2">
                        <x-input
                            class="max-w-16 text-right text-[1.1rem]"
                            min="4"
                            :max="maxRamGB"
                            :value="ramGB"
                            @input="(e: any) => ramGB = Number(/^\d+$/.exec(e.target.value)![0] || 4)"
                            required
                        ></x-input>
                        <p class="text-neutral-100">GB</p>
                    </div>
                </x-card>
                <x-card
                    class="flex items-center p-2 flex-row justify-between w-full py-3 my-0 bg-neutral-800/20 backdrop-brightness-150 backdrop-blur-xl">
                    <div>
                        <div class="flex flex-row items-center gap-2 mb-2">
                            <Icon class="text-violet-400 inline-flex size-8" icon="solar:cpu-bold"></Icon>
                            <h1 class="text-lg my-0 font-semibold">
                                CPU Cores
                            </h1>
                        </div>
                        <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
                            How many CPU Cores are allocated to the Windows virtual machine
                        </p>
                    </div>
                    <div class="flex flex-row justify-center items-center gap-2">
                        <x-input
                            class="max-w-16 text-right text-[1.1rem]"
                            min="2"
                            :max="maxNumCores"
                            :value="numCores"
                            @input="(e: any) => numCores = Number(/^\d+$/.exec(e.target.value)![0] || 4)"
                            required
                        ></x-input>
                        <p class="text-neutral-100">Cores</p>
                    </div>
                </x-card>
                <div class="flex flex-col">
                    <p class="my-0 text-red-500" v-for="error, k of errors" :key="k">
                        ❗ {{ error }}
                    </p>
                </div>
                <x-button
                    :disabled="errors.length || (origNumCores === numCores && origRamGB === ramGB) || isApplyingChanges"
                    @click="applyChanges()"
                    class="w-24"
                >
                    <span v-if="!isApplyingChanges">Save</span>
                    <x-throbber v-else class="w-10"></x-throbber>
                </x-button>
            </div>
        </div>
        <div>
            <x-label class="mb-4 text-neutral-300">General</x-label>
            <div class="flex flex-col gap-4">
                <x-card
                    class="flex items-center p-2 flex-row justify-between w-full py-3 my-0 bg-neutral-800/20 backdrop-brightness-150 backdrop-blur-xl">
                    <div>
                        <div class="flex flex-row items-center gap-2 mb-2">
                            <Icon class="text-violet-400 inline-flex size-8" icon="uil:scaling-right"></Icon>
                            <h1 class="text-lg my-0 font-semibold">
                                Display Scaling
                            </h1>
                        </div>
                        <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
                            Controls how large the display scaling is. This applies for both the desktop view and applications.
                        </p>
                    </div>
                    <div class="flex flex-row justify-center items-center gap-2">
                        <x-select class="w-20" @change="(e: any) => scale = Number(e.detail.newValue)">
                            <x-menu>
                                <x-menuitem value="100" :toggled="scale === 100">
                                    <x-label>100%</x-label>
                                </x-menuitem>

                                <x-menuitem value="140" :toggled="scale === 140">
                                    <x-label>140%</x-label>
                                </x-menuitem>

                                <x-menuitem value="180" :toggled="scale === 180">
                                    <x-label>180%</x-label>
                                </x-menuitem>
                            </x-menu>
                        </x-select>
                    </div>
                </x-card>
            </div>
        </div>
        <div>
            <x-label class="mb-4 text-neutral-300">Danger Zone</x-label>
            <x-card class="flex flex-col w-full py-3 my-0 bg-red-500/10 backdrop-brightness-150 backdrop-blur-xl mb-6">
                <h1 class="my-0 font-normal text-lg text-red-300">
                    ⚠️ <span class="font-bold">WARNING:</span> All actions here are potentially destructive, proceed at your own caution!
                </h1>
            </x-card>
            <div >

            </div>
            <x-button
                class="!bg-red-800/20 px-4 py-1 !border-red-500/10 generic-hover flex flex-row items-center gap-2 !text-red-300"
                @click="resetWinboat()"
                :disabled="isResettingWinboat"
            >
                <Icon v-if="resetQuestionCounter < 3" icon="mdi:bomb" class="size-8"></Icon>
                <x-throbber v-else class="size-8"></x-throbber>

                <span v-if="resetQuestionCounter === 0">Reset Winboat & Remove VM</span>
                <span v-else-if="resetQuestionCounter === 1">Are you sure? This action cannot be undone.</span>
                <span v-else-if="resetQuestionCounter === 2">One final check, are you ABSOLUTELY sure?</span>
                <span v-else-if="resetQuestionCounter === 3">Resetting Winboat...</span>
            </x-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Winboat } from '../lib/winboat';
import { type ComposeConfig } from '../../types';
import { getSpecs } from '../lib/specs';
import { Icon } from '@iconify/vue';
import { WinboatConfig } from '../lib/config';
const { app }: typeof import('@electron/remote') = require('@electron/remote');

const winboat = new Winboat();

// For Resources
const compose = ref<ComposeConfig | null>(null);
const numCores = ref(0);
const origNumCores = ref(0);
const maxNumCores = ref(0);
const ramGB = ref(0);
const origRamGB = ref(0);
const maxRamGB = ref(0);
const isApplyingChanges = ref(false);
const resetQuestionCounter = ref(0);
const isResettingWinboat = ref(false);

// For General
const wbConfig = new WinboatConfig();
const scale = ref(100);

onMounted(async () => {
    await assignValues();
    scale.value = wbConfig.config.scale;

    watch(scale, (newVal, _) => {
        wbConfig.config.scale = newVal;
    })
})

async function assignValues() {
    compose.value = winboat.parseCompose();

    numCores.value = Number(compose.value.services.windows.environment.CPU_CORES);
    origNumCores.value = numCores.value;

    ramGB.value = Number(compose.value.services.windows.environment.RAM_SIZE.split("G")[0]);
    origRamGB.value = ramGB.value;

    const specs = await getSpecs();
    maxRamGB.value = specs.ramGB;
    maxNumCores.value = specs.cpuThreads;
}

async function applyChanges() {
    compose.value!.services.windows.environment.RAM_SIZE = `${ramGB.value}G`;
    compose.value!.services.windows.environment.CPU_CORES = `${numCores.value}`;

    isApplyingChanges.value = true;
    try {
        await winboat.replaceCompose(compose.value!);
        await assignValues();
    } catch(e) {
        console.error("Failed to apply changes");
        console.error(e);
    } finally {
        isApplyingChanges.value = false;
    }
}

const errors = computed(() => {
    let errCollection: string[] = [];

    if (!numCores.value || numCores.value < 2) {
        errCollection.push("You must allocate at least two CPU cores for Windows to run properly")
    }

    if (numCores.value > maxNumCores.value) {
        errCollection.push("You cannot allocate more CPU cores to Windows than you have available")
    }

    if (!ramGB.value || ramGB.value < 4) {
        errCollection.push("You must allocate at least 4 GB of RAM for Windows to run properly")
    }

    if (ramGB.value > maxRamGB.value) {
        errCollection.push("You cannot allocate more RAM to Windows than you have available")
    }

    return errCollection;
})

async function resetWinboat() {
    if (++resetQuestionCounter.value < 3) {
        return;
    }

    isResettingWinboat.value = true;
    await winboat.resetWinboat();
    app.exit();
}

</script>

<style>
</style>