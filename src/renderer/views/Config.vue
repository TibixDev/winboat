<template>
    <div class="flex flex-col gap-10 overflow-x-hidden" :class="{ 'hidden': !maxNumCores }">
        <div>
            <x-label class="mb-4 text-neutral-300">Resources</x-label>
            <div class="flex flex-col gap-4">
                <x-card
                    class="flex flex-row justify-between items-center p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20">
                    <div>
                        <div class="flex flex-row gap-2 items-center mb-2">
                            <Icon class="inline-flex text-violet-400 size-8" icon="game-icons:ram"></Icon>
                            <h1 class="my-0 text-lg font-semibold">
                                RAM Allocation
                            </h1>
                        </div>
                        <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
                            How many gigabytes of RAM are allocated to the Windows virtual machine
                        </p>
                    </div>
                    <div class="flex flex-row gap-2 justify-center items-center">
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
                    class="flex flex-row justify-between items-center p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20">
                    <div>
                        <div class="flex flex-row gap-2 items-center mb-2">
                            <Icon class="inline-flex text-violet-400 size-8" icon="solar:cpu-bold"></Icon>
                            <h1 class="my-0 text-lg font-semibold">
                                CPU Cores
                            </h1>
                        </div>
                        <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
                            How many CPU Cores are allocated to the Windows virtual machine
                        </p>
                    </div>
                    <div class="flex flex-row gap-2 justify-center items-center">
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
                <x-card class="flex relative z-20 flex-row justify-between items-center p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20">
                    <div>
                        <div class="flex flex-row items-center gap-2 mb-2">
                            <Icon class="text-violet-400 inline-flex size-8" icon="fluent:folder-link-32-filled"></Icon>
                            <h1 class="text-lg my-0 font-semibold">
                                Shared Home Folder
                            </h1>
                        </div>
                        <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
                            If enabled, you will be able to access your Linux home folder within Windows under 
                            <span class="font-mono bg-neutral-700 rounded-md px-1 py-0.5">Network\host.lan</span>
                        </p>
                    </div>
                    <div class="flex flex-row justify-center items-center gap-2">
                        <x-switch
                            :toggled="shareHomeFolder"
                            @toggle="(_: any) => shareHomeFolder = !shareHomeFolder"
                            size="large"
                        ></x-switch>
                    </div>
                </x-card>
                <div class="flex flex-col">
                    <p class="my-0 text-red-500" v-for="error, k of errors" :key="k">
                        ❗ {{ error }}
                    </p>
                </div>
                <x-button
                    :disabled="saveButtonDisabled || isUpdatingUSBPrerequisites"
                    @click="applyChanges()"
                    class="w-24"
                >
                    <span v-if="!isApplyingChanges || isUpdatingUSBPrerequisites">Save</span>
                    <x-throbber v-else class="w-10"></x-throbber>
                </x-button>
            </div>
        </div>
        <div>
            <x-label class="mb-4 text-neutral-300">Devices</x-label>
            <div class="flex flex-col gap-4">
                <x-card class="flex relative z-20 flex-row justify-between items-center p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20">
                    <div class="w-full">
                        <div class="flex flex-row gap-2 items-center mb-2">
                            <Icon class="inline-flex text-violet-400 size-8" icon="fluent:tv-usb-24-filled"></Icon>
                            <h1 class="my-0 text-lg font-semibold">
                                USB Passthrough
                            </h1>
                        </div>
                        <TransitionGroup name="usb-transition" tag="div" class="">
                            <template v-if="usbPassthroughDisabled || isUpdatingUSBPrerequisites">
                                <x-card 
                                    class="flex items-center py-2 w-full my-2 backdrop-blur-xl gap-4 backdrop-brightness-150 bg-yellow-200/10"
                                >
                                    <Icon class="inline-flex text-yellow-500 size-8" icon="clarity:warning-solid"></Icon>
                                    <h1 class="my-0 text-base font-normal text-yellow-200">
                                        We need to update your Docker Compose in order to use this feature!
                                    </h1>

                                    <x-button 
                                        :disabled="isUpdatingUSBPrerequisites"
                                        class="mt-1 !bg-gradient-to-tl from-yellow-200/20 to-transparent ml-auto hover:from-yellow-300/30 transition !border-0"
                                        @click="addRequiredComposeFieldsUSB"
                                    >
                                        <x-label
                                            class="ext-lg font-normal text-yellow-200"
                                            v-if="!isUpdatingUSBPrerequisites"
                                        >
                                            Update
                                        </x-label>

                                        <x-throbber v-else class="w-8 text-yellow-300"></x-throbber>
                                    </x-button>
                                </x-card>
                            </template>
                            <template v-else>
                                <x-label 
                                    class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0" 
                                    v-if="usbManager.ptDevices.value.length == 0"
                                >
                                    Press the button below to add USB devices to your passthrough list
                                </x-label>
                                <TransitionGroup name="devices" tag="x-box" class="flex-col gap-2 mt-4">
                                    <x-card 
                                        class="flex justify-between items-center px-2 py-0 m-0 bg-white/5"
                                        :class="{ 'opacity-75': !usbManager.isPTDeviceConnected(device) }"
                                        v-for="device, k of usbManager.ptDevices.value" 
                                        :key="`${device.vendorId}-${device.productId}`"
                                    >
                                        <div class="flex flex-row gap-2 items-center"> 
                                            <Icon v-if="!usbManager.isPTDeviceConnected(device)" class="inline-flex text-red-500 size-7" icon="clarity:warning-solid">
                                            </Icon>
                                            <p class="text-base !m-0 text-gray-200">
                                                {{ usbManager.stringifyPTSerializableDevice(device) }}
                                            </p>
                                        </div>
                                        <x-button @click="removeDevice(device)" class="mt-1 !bg-gradient-to-tl from-red-500/20 to-transparent hover:from-red-500/30 transition !border-0">
                                            <x-icon href="#remove"></x-icon>
                                        </x-button>
                                    </x-card>
                                </TransitionGroup>
                                <x-button 
                                    v-if="availableDevices.length > 0"
                                    class="mt-4 !bg-gradient-to-tl from-blue-400/20 shadow-md shadow-blue-950/20 to-transparent hover:from-blue-400/30 transition"
                                    @click="refreshAvailableDevices()"
                                >
                                    <x-icon href="#add"></x-icon>
                                    <x-label>Add Device</x-label>
                                    <TransitionGroup ref="usbMenu" name="menu" tag="x-menu">
                                        <x-menuitem 
                                            v-for="device, k of availableDevices as Device[]" 
                                            :key="`${device.deviceDescriptor.idVendor}-${device.deviceDescriptor.idProduct}`"
                                            @click="addDevice(device)"
                                        >
                                            <x-label>{{ usbManager.stringifyDevice(device) }}</x-label>
                                        </x-menuitem>
                                        <x-menuitem v-if="availableDevices.length === 0" disabled>
                                            <x-label>No available devices</x-label>
                                        </x-menuitem>
                                    </TransitionGroup>
                                </x-button>
                            </template>
                        </TransitionGroup>
                    </div>
                </x-card>
            </div>
        </div>
        <div>
            <x-label class="mb-4 text-neutral-300">General</x-label>
            <div class="flex flex-col gap-4">
                <x-card
                    class="flex flex-row justify-between items-center p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20">
                    <div>
                        <div class="flex flex-row gap-2 items-center mb-2">
                            <Icon class="inline-flex text-violet-400 size-8" icon="uil:scaling-right"></Icon>
                            <h1 class="my-0 text-lg font-semibold">
                                Display Scaling
                            </h1>
                        </div>
                        <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
                            Controls how large the display scaling is. This applies for both the desktop view and applications
                        </p>
                    </div>
                    <div class="flex flex-row gap-2 justify-center items-center">
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
                    class="flex flex-row justify-between items-center p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20">
                    <div>
                        <div class="flex flex-row gap-2 items-center mb-2">
                            <Icon class="inline-flex text-violet-400 size-8" icon="game-icons:swipe-card"></Icon>
                            <h1 class="my-0 text-lg font-semibold">
                                Smartcard Passthrough
                            </h1>
                        </div>
                        <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
                            If enabled, your smartcard readers will be passed to Windows when you start an app
                        </p>
                    </div>
                    <div class="flex flex-row gap-2 justify-center items-center">
                        <x-switch
                            :toggled="wbConfig.config.smartcardEnabled"
                            @toggle="(_: any) => wbConfig.config.smartcardEnabled = !wbConfig.config.smartcardEnabled"
                            size="large"
                        ></x-switch>
                    </div>
                </x-card>
                <x-card
                    class="flex flex-row justify-between items-center p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20">
                    <div>
                        <div class="flex flex-row gap-2 items-center mb-2">
                            <Icon class="inline-flex text-violet-400 size-8" icon="fluent:remote-16-filled"></Icon>
                            <h1 class="my-0 text-lg font-semibold">
                                RDP Monitoring
                            </h1>
                        </div>
                        <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
                            If enabled, a banner will appear when the RDP session is connected (may cause high CPU usage, disable if you notice performance issues)
                        </p>
                    </div>
                    <div class="flex flex-row gap-2 justify-center items-center">
                        <x-switch
                            :toggled="wbConfig.config.rdpMonitoringEnabled"
                            @toggle="(_: any) => wbConfig.config.rdpMonitoringEnabled = !wbConfig.config.rdpMonitoringEnabled"
                            size="large"
                        ></x-switch>
                    </div>
                </x-card>
            </div>
        </div>
        <div>
            <x-label class="mb-4 text-neutral-300">Danger Zone</x-label>
            <x-card class="flex flex-col py-3 my-0 mb-6 w-full backdrop-blur-xl backdrop-brightness-150 bg-red-500/10">
                <h1 class="my-0 text-lg font-normal text-red-300">
                    ⚠️ <span class="font-bold">WARNING:</span> All actions here are potentially destructive, proceed at your own caution!
                </h1>
            </x-card>
            <div>

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
import { USBManager, type PTSerializableDeviceInfo } from '../lib/usbmanager';
import { type Device } from 'usb';
const { app }: typeof import('@electron/remote') = require('@electron/remote');

const winboat = new Winboat();
const usbManager = new USBManager();

// Constants
const HOMEFOLDER_SHARE_STR = "${HOME}:/shared";
const USB_BUS_PATH = "/dev/bus/usb:/dev/bus/usb";
const QMP_ARGUMENT = "-qmp tcp:0.0.0.0:7149,server,wait=off";
const QMP_PORT = "7149";

// For Resources
const compose = ref<ComposeConfig | null>(null);
const numCores = ref(0);
const origNumCores = ref(0);
const maxNumCores = ref(0);
const ramGB = ref(0); 
const origRamGB = ref(0);
const maxRamGB = ref(0);
const origShareHomeFolder = ref(false);
const shareHomeFolder = ref(false);
const isApplyingChanges = ref(false);
const resetQuestionCounter = ref(0);
const isResettingWinboat = ref(false);
const isUpdatingUSBPrerequisites = ref(false);

// For General
const wbConfig = new WinboatConfig();

onMounted(async () => {
    await assignValues();
});

async function assignValues() {
    compose.value = winboat.parseCompose();

    numCores.value = Number(compose.value.services.windows.environment.CPU_CORES);
    origNumCores.value = numCores.value;

    ramGB.value = Number(compose.value.services.windows.environment.RAM_SIZE.split("G")[0]);
    origRamGB.value = ramGB.value;

    shareHomeFolder.value = compose.value.services.windows.volumes.includes(HOMEFOLDER_SHARE_STR);
    origShareHomeFolder.value = shareHomeFolder.value;

    const specs = await getSpecs();
    maxRamGB.value = specs.ramGB;
    maxNumCores.value = specs.cpuThreads;

    refreshAvailableDevices();
}

async function saveDockerCompose() {
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

async function applyChanges() {
    compose.value!.services.windows.environment.RAM_SIZE = `${ramGB.value}G`;
    compose.value!.services.windows.environment.CPU_CORES = `${numCores.value}`;
    // compose.value!.services.windows.environment.ARGUMENTS = DefaultCompose.services.windows.environment.ARGUMENTS + serializeUSBDevices(selectedUsbDevices);

    const composeHasHomefolderShare = compose.value!.services.windows.volumes.includes(HOMEFOLDER_SHARE_STR);

    if (shareHomeFolder.value && !composeHasHomefolderShare) {
        compose.value!.services.windows.volumes.push(HOMEFOLDER_SHARE_STR);
    } else if (!shareHomeFolder.value && composeHasHomefolderShare) {
        compose.value!.services.windows.volumes = compose.value!.services.windows.volumes.filter(v => v !== HOMEFOLDER_SHARE_STR);
    }

    await saveDockerCompose();
}

async function addRequiredComposeFieldsUSB() {
    if (!usbPassthroughDisabled.value) {
        return;
    }
    
    isUpdatingUSBPrerequisites.value = true;

    if(!hasUsbVolume(compose)) {
        compose.value!.services.windows.volumes.push(USB_BUS_PATH);
    }
    if(!hasQmpPort(compose)) {
        compose.value!.services.windows.ports.push(`${QMP_PORT}:${QMP_PORT}`);
    }

    if(!compose.value!.services.windows.environment.ARGUMENTS) {
        compose.value!.services.windows.environment.ARGUMENTS = "";
    }
    if(!hasQmpArgument(compose)) {
        compose.value!.services.windows.environment.ARGUMENTS += `\n${QMP_ARGUMENT}`;
    }

    if(!compose.value!.services.windows.environment.HOST_PORTS) {
        compose.value!.services.windows.environment.HOST_PORTS = "";
    }
    if(!hasHostPort(compose)) {
        const delimeter = compose.value!.services.windows.environment.HOST_PORTS.length == 0 ? '' : ',';
        compose.value!.services.windows.environment.HOST_PORTS += delimeter + QMP_PORT;
    }
    
    await saveDockerCompose();

    isUpdatingUSBPrerequisites.value = false;
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

const hasUsbVolume = (_compose: typeof compose) => _compose.value?.services.windows.volumes?.includes(USB_BUS_PATH);
const hasQmpArgument = (_compose: typeof compose) => _compose.value?.services.windows.environment.ARGUMENTS?.includes(QMP_ARGUMENT);
const hasQmpPort = (_compose: typeof compose) => _compose.value?.services.windows.ports?.includes(`${QMP_PORT}:${QMP_PORT}`)
const hasHostPort = (_compose: typeof compose) => _compose.value?.services.windows.environment.HOST_PORTS?.includes(QMP_PORT);

const usbPassthroughDisabled = computed(() => {
    return !hasUsbVolume(compose) || !hasQmpArgument(compose) || !hasQmpPort(compose) || !hasHostPort(compose);
})

const saveButtonDisabled = computed(() => {
    const hasResourceChanges = origNumCores.value !== numCores.value || origRamGB.value !== ramGB.value || shareHomeFolder.value !== origShareHomeFolder.value;
    const shouldBeDisabled = errors.value.length || !hasResourceChanges || isApplyingChanges.value;
    return shouldBeDisabled;
})

async function resetWinboat() {
    if (++resetQuestionCounter.value < 3) {
        return;
    }

    isResettingWinboat.value = true;
    await winboat.resetWinboat();
    app.exit();
}

// USB Passthrough functionality
const LINUX_FOUNDATION_VID = "1d6b";

const availableDevices = ref<Device[]>([]);
// Reactivity utterly fails here, so we use this function to
// refresh via the button
function refreshAvailableDevices() {
    availableDevices.value = usbManager.devices.value.filter(device => {
        return !usbManager.isDeviceInPassthroughList(device) &&
            !usbManager.stringifyDevice(device).includes(LINUX_FOUNDATION_VID);
    });
    console.info('[Available Devices] Debug', availableDevices.value);
}

function addDevice(device: Device): void {
    try {
        usbManager.addDeviceToPassthroughList(device);
    } catch (error) {
        console.error('Failed to add device to passthrough list:', error);
    }
}

function removeDevice(ptDevice: PTSerializableDeviceInfo): void {
    try {
        usbManager.removeDeviceFromPassthroughList(ptDevice);
    } catch (error) {
        console.error('Failed to remove device from passthrough list:', error);
    }
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

.usb-transition-move, 
.usb-transition-enter-active,
.usb-transition-leave-active {
  transition: all 0.5s ease;
}

.usb-transition-enter-from,
.usb-transition-leave-to {
  opacity: 0;
  transform: translateX(20px) scale(0.9);
}

.usb-transition-leave-active {
  position: absolute;
}
</style>