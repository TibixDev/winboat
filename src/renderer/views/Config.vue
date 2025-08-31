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
                <x-card
                    class="flex flex-row items-center justify-between p-2 relative z-20  w-full py-3 my-0 bg-neutral-800/20 backdrop-brightness-150 backdrop-blur-xl">
                    <div class="w-full">
                        <div class="flex flex-row items-center gap-2 mb-2">
                            <Icon class="text-violet-400 inline-flex size-8" icon="fluent:tv-usb-24-filled"></Icon>
                            <h1 class="text-lg my-0 font-semibold">
                                USB Passthrough
                            </h1>
                        </div>
                        <x-label class="text-base" v-if="usbDevicesIdxs.length == 0">Press the button below to add USB devices to your passthrough list</x-label>
                        <TransitionGroup name="devices" tag="x-box" class="flex-col gap-1 mt-4">
                            <x-card 
                                class="flex items-center justify-between m-0 py-0 px-2 bg-white/10" 
                                v-for="index, k of usbDevicesIdxs" 
                                :key="index" 
                                @mouseenter="(e: Event) => hasIssue(displayUsbDevices[index]) && showTooltip(e)"
                                @mouseleave="(e: Event) => hasIssue(displayUsbDevices[index]) && closeTooltip(e)"
                            >
                                <x-tooltip class="scale-125" v-if="hasIssue(displayUsbDevices[index])">{{ (displayUsbDevices[index] as USBDeviceWithIssue).issue }}</x-tooltip>
                                <div class="flex flex-row items-center gap-2"> 
                                    <Icon v-if="hasIssue(displayUsbDevices[index])" class="text-red-500 inline-flex size-7" icon="clarity:warning-solid">
                                    </Icon>
                                    <p class="text-base !m-0">{{ displayUsbDevices[index].alias }}</p>
                                </div>
                                <x-button @click="usbDevicesIdxs.splice(k, 1)" class="mt-1 !bg-gradient-to-tl shadow-md shadow-red-900/20 !border-1 !border-slate-800/15  from-red-500/20 to-transparent hover:from-red-500/30 transition">
                                    <x-icon href="#remove"></x-icon>
                                </x-button>
                            </x-card>
                        </TransitionGroup>
                        <x-button 
                            v-if="filterMenuItems().length > 0"
                            class="mt-4 !bg-gradient-to-tl from-blue-400/20 shadow-md shadow-blue-950/20 to-transparent hover:from-blue-400/30 transition"
                            @click="fetchUSBDevices({ignoreVendorIDs: ['1d6b']}).then(x => updateDisplayUSBList(x)).then(_ => console.log(usbDevicesIdxs.length, displayUsbDevices.length))"
                        >
                            <x-icon href="#add"></x-icon>
                            <x-label>Add Device</x-label>
                            <TransitionGroup ref="usbMenu" name="menu" tag="x-menu">
                                <x-menuitem 
                                    v-for="device, k of filterMenuItems()" 
                                    :key="k"
                                    @click="(e: any) => {usbDevicesIdxs.push(displayUsbDevices.indexOf(device)); e.stopPropagation()}"
                                >
                                    <x-label>{{device.alias}}</x-label>
                                </x-menuitem>
                                <x-menuitem v-if="filterMenuItems().length === 0" disabled>
                                    <x-label>No available devices</x-label>
                                </x-menuitem>
                            </TransitionGroup>
                        </x-button>
                    </div>
                </x-card>
                <div class="flex flex-col">
                    <p class="my-0 text-red-500" v-for="error, k of errors" :key="k">
                        ❗ {{ error }}
                    </p>
                </div>
                <x-button
                    :disabled="errors.length || (origNumCores === numCores && origRamGB === ramGB && shouldUpdateUsbList) || isApplyingChanges"
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
                    class="flex flex-row items-center justify-between p-2 relative z-10  w-full py-3 my-0 bg-neutral-800/20 backdrop-brightness-150 backdrop-blur-xl">
                    <div>
                        <div class="flex flex-row items-center gap-2 mb-2">
                            <Icon class="text-violet-400 inline-flex size-8" icon="uil:scaling-right"></Icon>
                            <h1 class="text-lg my-0 font-semibold">
                                Display Scaling
                            </h1>
                        </div>
                        <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
                            Controls how large the display scaling is. This applies for both the desktop view and applications
                        </p>
                    </div>
                    <div class="flex flex-row justify-center items-center gap-2">
                        <x-select class="w-20 z-100" @change="(e: any) => wbConfig.config.scale = Number(e.detail.newValue)">
                            <x-menu>
                                <x-menuitem value="100" :toggled="wbConfig.config.scale === 100">
                                    <x-label>100%</x-label>
                                </x-menuitem>

                                <x-menuitem value="140" :toggled="wbConfig.config.scale === 140">
                                    <x-label>140%</x-label>
                                </x-menuitem>

                                <x-menuitem value="180" :toggled="wbConfig.config.scale === 180">
                                    <x-label>180%</x-label>
                                </x-menuitem>
                            </x-menu>
                        </x-select>
                    </div>
                </x-card>
                <x-card
                    class="flex items-center p-2 flex-row justify-between w-full py-3 my-0 bg-neutral-800/20 backdrop-brightness-150 backdrop-blur-xl">
                    <div>
                        <div class="flex flex-row items-center gap-2 mb-2">
                            <Icon class="text-violet-400 inline-flex size-8" icon="game-icons:swipe-card"></Icon>
                            <h1 class="text-lg my-0 font-semibold">
                                Smartcard Passthrough
                            </h1>
                        </div>
                        <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
                            If enabled, your smartcard readers will be passed to Windows when you start an app
                        </p>
                    </div>
                    <div class="flex flex-row justify-center items-center gap-2">
                        <x-switch
                            :toggled="wbConfig.config.smartcardEnabled"
                            @toggle="(_: any) => wbConfig.config.smartcardEnabled = !wbConfig.config.smartcardEnabled"
                            size="large"
                        ></x-switch>
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
import type { ComposeConfig, USBDevice } from '../../types';
import { getSpecs } from '../lib/specs';
import { Icon } from '@iconify/vue';
import { WinboatConfig } from '../lib/config';
import { fetchUSBDevices, extractUSBFromDockerArgs, serializeUSBDevices } from '../lib/usb';
const { app }: typeof import('@electron/remote') = require('@electron/remote');

type USBDeviceWithIssue = (USBDevice & { issue: string });
type USBDeviceWithPossibleIssue = USBDevice | USBDeviceWithIssue;

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
const usbDevicesIdxs = ref(Array<number>());
const displayUsbDevices = ref(Array<USBDeviceWithPossibleIssue>());
const origUsbDevices = ref(Array<USBDevice>())

// For General
const wbConfig = new WinboatConfig();

onMounted(async () => {
    await assignValues();
    watch(usbDevicesIdxs.value, async () => {
        if(usbDevicesIdxs.value.length != displayUsbDevices.value.length) return;
        // ideally we'd like to close the usb selection menu when its empty but that causes the entire config screen to stop working sadly
        //await document.querySelector("[role='menu']")?.close();
    });
})

async function assignValues() {
    compose.value = winboat.parseCompose();

    numCores.value = Number(compose.value.services.windows.environment.CPU_CORES);
    origNumCores.value = numCores.value;

    ramGB.value = Number(compose.value.services.windows.environment.RAM_SIZE.split("G")[0]);
    origRamGB.value = ramGB.value;

    usbDevicesIdxs.value = [];
    displayUsbDevices.value = await fetchUSBDevices({ignoreVendorIDs: ['1d6b']});
    origUsbDevices.value = await extractUSBFromDockerArgs(compose.value.services.windows.environment.ARGUMENTS);

    for (const device of origUsbDevices.value) {
        const idx = displayUsbDevices.value.findIndex(
            elem => 
                elem.productID == device.productID 
                && elem.vendorID == device.vendorID 
                && elem.alias == device.alias);

        if (idx !== -1) {
            usbDevicesIdxs.value.push(idx);
            continue;
        }

        displayUsbDevices.value.push({...device, issue: "USB device not connected"});
        usbDevicesIdxs.value.push(displayUsbDevices.value.length - 1);
        console.log(displayUsbDevices.value)
    }

    const specs = await getSpecs();
    maxRamGB.value = specs.ramGB;
    maxNumCores.value = specs.cpuThreads;
}

async function applyChanges() {
    const selectedUsbDevices = usbDevicesIdxs.value.map(x => filterIssue(displayUsbDevices.value[x])) as USBDevice[];

    compose.value!.services.windows.environment.RAM_SIZE = `${ramGB.value}G`;
    compose.value!.services.windows.environment.CPU_CORES = `${numCores.value}`;
    compose.value!.services.windows.environment.ARGUMENTS = serializeUSBDevices(selectedUsbDevices);

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

// Needed because xel only implemented this for buttons
function showTooltip(e: Event) {
    const elem = e.target as HTMLElement;
    const tooltip = elem.querySelector("x-tooltip") as any;
    tooltip.open(elem);
}

// Needed because xel only implemented this for buttons
function closeTooltip(e: Event) {
    const elem = e.target as HTMLElement;
    const tooltip = elem.querySelector("x-tooltip") as any;
    tooltip.close(elem);
}

function updateDisplayUSBList(devices: USBDevice[]) {
    for(const device of devices) {
        const idx = displayUsbDevices.value.findIndex(
            elem => 
                elem.productID == device.productID 
                && elem.vendorID == device.vendorID 
                && elem.alias == device.alias);
        if(idx !== -1) continue;
        displayUsbDevices.value.push(device);
    }
}

const hasIssue = (device?: USBDeviceWithPossibleIssue) => device?.hasOwnProperty("issue");
const filterMenuItems = () => displayUsbDevices.value.filter((elem, i: number) => !usbDevicesIdxs.value.includes(i) && !hasIssue(elem));
const filterIssue = (device: USBDeviceWithPossibleIssue): USBDevice => Object({
    vendorID: device.vendorID,
    productID: device.productID,
    alias: device.alias
});

function areExclusiveArraysEqual<T>(a: T[], b: T[]): boolean {
    const compareObjects = (obj1: any, obj2: any) => 
        Object.keys(obj1).length === Object.keys(obj2).length &&
        Object.keys(obj1).every(key => obj1[key] === obj2[key]);

    return a.length === b.length && 
        a.every((elem: any) => b.find(other => compareObjects(elem, other)));
}

const shouldUpdateUsbList = computed(() => {
    const selectedUsbDevices = usbDevicesIdxs.value.map(x => filterIssue(displayUsbDevices.value[x])) as USBDevice[];
    console.log({selectedUsbDevices, a: origUsbDevices.value}, areExclusiveArraysEqual(selectedUsbDevices, origUsbDevices.value))
    return areExclusiveArraysEqual(selectedUsbDevices, origUsbDevices.value);
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

<style scoped>
.devices-move, 
.devices-enter-active,
.devices-leave-active {
  transition: all 0.5s ease;
}

.devices-enter-from,
.devices-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.devices-leave-active {
  position: absolute;
}

.menu-move, 
.menu-enter-active,
.menu-leave-active {
  transition: all 0.5s ease;
}

.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateX(20px) scale(0.9);
}

.menu-leave-active {
  position: absolute;
}
</style>