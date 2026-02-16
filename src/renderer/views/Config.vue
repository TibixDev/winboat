<template>
    <div>
        <teleport to="body">
            <div v-if="resetOptionsVisible"
                class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div class="w-[min(520px,90vw)] rounded-2xl border border-white/10 bg-neutral-900/90 p-6 shadow-2xl">
                    <div class="flex items-center gap-3">
                        <Icon class="text-red-400 size-8" icon="mdi:alert-circle"></Icon>
                        <h2 class="my-0 text-lg font-semibold text-neutral-100">Reset complete</h2>
                    </div>
                    <p class="mt-3 text-sm text-neutral-300">
                        DOSBoat was reset and the VM was removed. Choose what you want to do next.
                    </p>
                    <div class="mt-6 flex items-center justify-end gap-3">
                        <x-button class="!bg-blue-500/20 hover:!bg-blue-500/30 !border-0" @click="startSetupAfterReset">
                            <x-label>Start new setup</x-label>
                        </x-button>
                        <x-button class="!bg-red-600/20 hover:!bg-red-600/30 !border-0" @click="closeAfterReset">
                            <x-label>Close</x-label>
                        </x-button>
                    </div>
                </div>
            </div>
        </teleport>

        <!-- USB device details modal -->
        <teleport to="body">
            <div v-if="deviceDetailsVisible"
                class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div class="w-[min(820px,96vw)] rounded-2xl border border-white/10 bg-neutral-900/90 p-6 shadow-2xl max-h-[80vh] overflow-auto">
                    <div class="flex items-center gap-3">
                        <Icon class="text-violet-400 size-8" icon="mdi:usb"></Icon>
                        <h2 class="my-0 text-lg font-semibold text-neutral-100">USB device details</h2>
                    </div>

                    <p class="mt-3 text-sm text-neutral-300">
                        <span v-if="deviceDetailsData">{{ deviceDetailsData.device ? usbManager.stringifyPTSerializableDevice(deviceDetailsData.device) : '' }}</span>
                        <span v-else>Loading...</span>
                    </p>

                    <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h3 class="text-xs text-neutral-400 mb-2">QEMU qtree (matching lines)</h3>
                            <pre class="bg-neutral-800/60 p-3 rounded text-xs text-gray-300 overflow-auto max-h-40">{{ (deviceDetailsData?.qtreeDeviceLines || []).join('\n') || deviceDetailsData?.qtreeFull || '—' }}</pre>
                        </div>

                        <div>
                            <h3 class="text-xs text-neutral-400 mb-2">Recent qmp.log</h3>
                            <pre class="bg-neutral-800/60 p-3 rounded text-xs text-gray-300 overflow-auto max-h-40">{{ deviceDetailsData?.qmpLogTail || '—' }}</pre>
                        </div>

                        <div class="md:col-span-2">
                            <h3 class="text-xs text-neutral-400 mb-2">Recent dosboat.log</h3>
                            <pre class="bg-neutral-800/60 p-3 rounded text-xs text-gray-300 overflow-auto max-h-48">{{ deviceDetailsData?.dosboatLogTail || '—' }}</pre>
                        </div>
                    </div>

                    <div class="mt-6 flex items-center justify-end gap-3">
                        <x-button :disabled="deviceDetailsLoading" @click="verifyDeviceInGuest(deviceDetailsData?.device)">
                            <x-label>Verify in VM</x-label>
                        </x-button>
                        <x-button class="!bg-red-600/20 hover:!bg-red-600/30 !border-0" @click="deviceDetailsVisible=false">
                            <x-label>Close</x-label>
                        </x-button>
                    </div>
                </div>
            </div>
        </teleport>
        <div class="flex flex-col gap-10 overflow-x-hidden" :class="{ hidden: !maxNumCores }">
            <div>
                <x-label class="mb-4 text-neutral-300">Container</x-label>
                <div class="flex flex-col gap-4">
                    <!-- RAM Allocation -->
                    <ConfigCard icon="game-icons:ram" title="RAM Allocation"
                        desc="Memory available to the FreeDOS virtual machine" type="number" :min="memoryOptionsMB[0]"
                        :max="memoryOptionsMB[memoryOptionsMB.length - 1]" :step="memoryOptionsMB"
                        :value-map="ramMBToLabel" v-model:value="ramMB" />

                    <!-- CPU Cores -->
                    <ConfigCard icon="solar:cpu-bold" title="CPU Cores"
                        desc="How many CPU Cores are allocated to the FreeDOS virtual machine" type="number"
                        unit="Cores" :min="1" :max="maxNumCores" v-model:value="numCores" />

                    <!-- Shared Folder -->
                    <ConfigCard icon="fluent:folder-link-32-filled" title="Shared Folder" type="switch"
                        v-model:value="shareFolder">
                        <template v-slot:desc>
                            If enabled, your selected folder will appear in FreeDOS as a shared drive
                            (<span class="font-mono bg-neutral-700 rounded-md px-1 py-0.5">D:</span>). The CD-ROM will
                            move to the next letter.
                        </template>
                    </ConfigCard>

                    <!-- Shared Folder Location -->
                    <ConfigCard v-if="shareFolder" icon="mdi:folder-cog" title="Shared Folder Location" type="custom">
                        <template v-slot:desc>
                            <span v-if="sharedFolderPath">
                                Currently sharing: <span class="font-mono bg-neutral-700 rounded-md px-1 py-0.5">{{
                                    sharedFolderPath }}</span>
                            </span>
                            <span v-else>
                                Select a folder to share with FreeDOS
                            </span>
                        </template>
                        <x-button @click="selectSharedFolder">
                            Browse
                        </x-button>
                    </ConfigCard>

                    <!-- Shared Folder Drive Letter -->
                    <ConfigCard v-if="shareFolder" icon="mdi:drive-harddisk" title="Shared Folder Drive Letter"
                        desc="Drive letter is fixed to avoid FreeDOS letter gaps." type="dropdown"
                        :options="SHARED_DRIVE_LETTERS" v-model:value="wbConfig.config.sharedDriveLetter" />

                    <!-- Auto Start Container -->
                    <ConfigCard icon="clarity:power-solid" title="Auto Start Container"
                        desc="If enabled, the FreeDOS container will automatically be started when the system boots up"
                        type="switch" v-model:value="autoStartContainer" />
                    <div class="flex flex-col">
                        <p class="my-0 text-red-500" v-for="(error, k) of errors" :key="k">❗ {{ error }}</p>
                    </div>
                    <x-button :disabled="saveButtonDisabled || isUpdatingUSBPrerequisites" @click="saveCompose()"
                        class="w-24" :class="{
                            '!bg-violet-500/30 hover:!bg-violet-500/40 !border-violet-500/30 !text-violet-100':
                                !saveButtonDisabled && !isUpdatingUSBPrerequisites,
                        }">
                        <span v-if="!isApplyingChanges || isUpdatingUSBPrerequisites">Save</span>
                        <x-throbber v-else class="w-10"></x-throbber>
                    </x-button>
                    <x-label v-if="!saveButtonDisabled && !isUpdatingUSBPrerequisites" class="text-xs text-violet-300">
                        Unsaved changes
                    </x-label>
                </div>
            </div>
            <div v-show="wbConfig.config.experimentalFeatures">
                <x-label class="mb-4 text-neutral-300">Devices</x-label>
                <div class="flex flex-col gap-4">
                    <!-- USB Passthrough -->
                    <x-card
                        class="flex relative z-20 flex-row justify-between items-center p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20">
                        <div class="w-full">
                            <div class="flex flex-row gap-2 items-center mb-2">
                                <Icon class="inline-flex text-violet-400 size-8" icon="fluent:tv-usb-24-filled"></Icon>
                                <h1 class="my-0 text-lg font-semibold">
                                    USB Passthrough
                                    <span class="bg-violet-500 rounded-full px-3 py-0.5 text-sm ml-2"> Experimental
                                    </span>
                                </h1>
                            </div>

                            <template v-if="usbPassthroughDisabled || isUpdatingUSBPrerequisites">
                                <x-card
                                    class="flex items-center py-2 w-full my-2 backdrop-blur-xl gap-4 backdrop-brightness-150 bg-yellow-200/10">
                                    <Icon class="inline-flex text-yellow-500 size-8" icon="clarity:warning-solid">
                                    </Icon>
                                    <h1 class="my-0 text-base font-normal text-yellow-200">
                                        We need to update your Compose in order to use this feature!
                                    </h1>

                                    <x-button :disabled="isUpdatingUSBPrerequisites"
                                        class="mt-1 !bg-gradient-to-tl from-yellow-200/20 to-transparent ml-auto hover:from-yellow-300/30 transition !border-0"
                                        @click="addRequiredComposeFieldsUSB">
                                        <x-label class="ext-lg font-normal text-yellow-200"
                                            v-if="!isUpdatingUSBPrerequisites">
                                            Update
                                        </x-label>

                                        <x-throbber v-else class="w-8 text-yellow-300"></x-throbber>
                                    </x-button>
                                </x-card>
                            </template>
                            <template v-if="wbConfig.config.containerRuntime === ContainerRuntimes.PODMAN">
                                <x-card
                                    class="flex items-center py-2 w-full my-2 backdrop-blur-xl gap-4 backdrop-brightness-150 bg-yellow-200/10">
                                    <Icon class="inline-flex text-yellow-500 size-8" icon="clarity:warning-solid">
                                    </Icon>
                                    <h1 class="my-0 text-base font-normal text-yellow-200">
                                        USB Passthrough is not yet supported while using Podman as the container
                                        runtime.
                                    </h1>
                                </x-card>
                            </template>
                            <template v-if="
                                !usbPassthroughDisabled &&
                                !isUpdatingUSBPrerequisites &&
                                wbConfig.config.containerRuntime === ContainerRuntimes.DOCKER
                            ">
                                <x-label class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0"
                                    v-if="usbManager.ptDevices.value.length == 0">
                                    Press the button below to add USB devices to your passthrough list
                                </x-label>
                                <TransitionGroup name="devices" tag="x-box" class="flex-col gap-2 mt-4">
                                    <x-card class="flex justify-between items-center px-2 py-0 m-0 bg-white/5"
                                        v-for="device of usbManager.ptDevices.value"
                                        :key="`${device.vendorId}-${device.productId}`" :class="{
                                            'bg-white/[calc(0.05*0.75)] [&_*:not(div):not(span)]:opacity-75':
                                                !usbManager.isPTDeviceConnected(device),
                                        }">
                                        <div class="flex flex-row gap-2 items-center">
                                            <span v-if="
                                                usbManager.isMTPDevice(device) ||
                                                usbManager
                                                    .stringifyPTSerializableDevice(device)
                                                    .toLowerCase()
                                                    .includes('mtp')
                                            " class="relative group">
                                                <Icon icon="clarity:warning-solid"
                                                    class="text-yellow-300 size-7 cursor-pointer" />
                                                <span
                                                    class="absolute bottom-5 z-50 w-[320px] bg-neutral-800/90 backdrop-blur-sm text-xs text-gray-300 rounded-lg shadow-lg px-3 py-2 hidden group-hover:block transition-opacity duration-200 pointer-events-none">
                                                    This device appears to be using the MTP protocol, which is known for
                                                    being problematic. Some Desktop Environments automatically mount MTP
                                                    devices, which in turn causes DOSBoat to not be able to pass the
                                                    device
                                                    through.
                                                </span>
                                            </span>

                                            <span v-if="!usbManager.isPTDeviceConnected(device)" class="relative group">
                                                <Icon icon="ix:connection-fail"
                                                    class="text-red-500 size-7 cursor-pointer" />
                                                <span
                                                    class="absolute bottom-5 z-50 w-[320px] bg-neutral-800/90 backdrop-blur-sm text-xs text-gray-300 rounded-lg shadow-lg px-3 py-2 hidden group-hover:block transition-opacity duration-200 pointer-events-none">
                                                    This device is currently not connected.
                                                </span>
                                            </span>

                                            <p class="text-base !m-0 text-gray-200">
                                                {{ usbManager.stringifyPTSerializableDevice(device) }}
                                            </p>

                                            <!-- VM attachment status -->
                                            <span class="ml-2">
                                                <template v-if="guestStatus[`${device.vendorId}-${device.productId}`] === 'attached'">
                                                    <Icon icon="mdi:check-circle" class="text-emerald-400 size-6" />
                                                </template>
                                                <template v-else-if="guestStatus[`${device.vendorId}-${device.productId}`] === 'checking'">
                                                    <x-throbber class="w-4 h-4 inline-block ml-1"></x-throbber>
                                                </template>
                                                <template v-else-if="guestStatus[`${device.vendorId}-${device.productId}`] === 'not-attached'">
                                                    <Icon icon="mdi:close-circle" class="text-red-400 size-6" />
                                                </template>
                                                <template v-else>
                                                    <Icon icon="mdi:help-circle" class="text-neutral-400 size-6" />
                                                </template>
                                            </span>
                                        </div>

                                        <div class="flex items-center gap-2">
                                            <x-button @click="verifyDeviceInGuest(device)" :disabled="!canVerify" :title="canVerify ? 'Verify passthrough status' : (winboat.isOnline ? 'Waiting for QMP...' : 'VM not running')" class="mt-1 !bg-gradient-to-tl from-blue-400/10 to-transparent hover:from-blue-400/20 transition !border-0 text-xs">
                                                <x-label v-if="!canVerify">Verify</x-label>
                                                <x-label v-else>Verify</x-label>
                                            </x-button>
                                            <x-button @click="showDeviceDetails(device)" :disabled="!canVerify" :title="canVerify ? 'Show QMP/log details' : 'Waiting for QMP...'" class="mt-1 !bg-gradient-to-tl from-neutral-700/10 to-transparent hover:from-neutral-700/20 transition !border-0 text-xs">
                                                <x-icon href="#info"></x-icon>
                                            </x-button>
                                            <x-button @click="removeDevice(device)" class="mt-1 !bg-gradient-to-tl from-red-500/20 to-transparent hover:from-red-500/30 transition !border-0">
                                                <x-icon href="#remove"></x-icon>
                                            </x-button>
                                        </div>
                                    </x-card>
                                </TransitionGroup>
                                <x-button v-if="availableDevices.length > 0"
                                    class="!bg-gradient-to-tl from-blue-400/20 shadow-md shadow-blue-950/20 to-transparent hover:from-blue-400/30 transition"
                                    :class="{ 'mt-4': usbManager.ptDevices.value.length }"
                                    @click="refreshAvailableDevices()">
                                    <x-icon href="#add"></x-icon>
                                    <x-label>Add Device</x-label>
                                    <TransitionGroup ref="usbMenu" name="menu" tag="x-menu" class="max-h-52">
                                        <x-menuitem v-for="(device, k) of availableDevices as Device[]"
                                            :key="device.portNumbers.join(',')" @click="addDevice(device)">
                                            <x-label>{{ usbManager.stringifyDevice(device) }}</x-label>
                                        </x-menuitem>
                                        <x-menuitem v-if="availableDevices.length === 0" disabled>
                                            <x-label>No available devices</x-label>
                                        </x-menuitem>
                                    </TransitionGroup>
                                </x-button>
                            </template>
                        </div>
                    </x-card>
                    <x-card
                        class="flex relative z-20 flex-row justify-between items-center p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20">
                        <div class="w-full">
                            <div class="flex flex-row gap-2 items-center mb-2">
                                <Icon class="inline-flex text-emerald-400 size-8" icon="mdi:serial-port"></Icon>
                                <h1 class="my-0 text-lg font-semibold">
                                    Serial Ports (COM)
                                </h1>
                                <x-button class="ml-auto !bg-gradient-to-tl from-emerald-400/10 to-transparent hover:from-emerald-400/20 transition !border-0 text-xs"
                                    @click="serialManager.refreshPorts()">
                                    <x-label>Refresh</x-label>
                                </x-button>
                            </div>

                            <x-label class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
                                Pass-through host serial devices (e.g. /dev/ttyUSB0) as COM ports in FreeDOS.
                            </x-label>

                            <div v-if="serialManager.availablePorts.value.length === 0"
                                class="mt-3 text-sm text-neutral-400">
                                No serial ports detected.
                            </div>

                            <div v-else class="mt-3 flex flex-col gap-2">
                                <div v-for="port in serialManager.availablePorts.value as SerialPortInfo[]"
                                    :key="port.path"
                                    class="flex items-center gap-3 rounded bg-white/5 px-3 py-2">
                                    <x-switch
                                        size="large"
                                        :toggled="serialManager.isPortPassedThrough(port.path)"
                                        @toggle="() => toggleSerialPort(port.path)"
                                    />
                                    <div class="flex flex-col">
                                        <span class="text-neutral-100 text-sm">{{ port.path }}</span>
                                        <span class="text-neutral-400 text-xs">
                                            {{ port.description }}
                                            <span v-if="port.vendorId && port.productId">
                                                ({{ port.vendorId }}:{{ port.productId }})
                                            </span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </x-card>
                </div>
            </div>

            <div>
                <x-label class="mb-4 text-neutral-300">Display</x-label>
                <div class="flex flex-col gap-4">
                    <!-- VNC Display Scaling -->
                    <ConfigCard class="relative z-10" icon="mdi:monitor-screenshot" title="VNC Display Scaling"
                        desc="Standard shows native resolution. Automatic scales to fit your browser window."
                        type="dropdown" :options="[{ label: 'Standard', value: 1 }, { label: 'Automatic', value: 2 }]"
                        v-model:value="wbConfig.config.vncScale" />
                </div>
            </div>

            <div>
                <x-label class="mb-4 text-neutral-300">DOSBoat</x-label>

                <div class="flex flex-col gap-4">
                    <!-- Experimental Features -->
                    <ConfigCard icon="streamline-ultimate:lab-tube-experiment" title="Experimental Features"
                        desc="If enabled, you'll have access to experimental features that may not be stable or complete"
                        type="switch" v-model:value="wbConfig.config.experimentalFeatures"
                        @toggle="toggleExperimentalFeatures" />

                    <!-- Advanced Settings 
                <ConfigCard
                    icon="mdi:administrator"
                    title="Advanced Settings"
                    desc="If enabled, you'll have access to advanced settings that may prevent DOSBoat from working if misconfigured"
                    type="switch"
                    v-model:value="wbConfig.config.advancedFeatures"
                />-->

                    <!-- Disable Animations -->
                    <ConfigCard icon="mdi:animation-outline" title="Disable Animations"
                        desc="Disables all animations in DOSBoat. Useful if the UI feels sluggish or your system lacks dedicated GPU acceleration."
                        type="switch" v-model:value="wbConfig.config.disableAnimations" />
                </div>
            </div>

            <div>
                <x-label class="mb-4 text-neutral-300">Danger Zone</x-label>
                <x-card
                    class="flex flex-col py-3 my-0 mb-6 w-full backdrop-blur-xl backdrop-brightness-150 bg-red-500/10">
                    <h1 class="my-0 text-lg font-normal text-red-300">
                        ⚠️ <span class="font-bold">WARNING:</span> All actions here are potentially destructive, proceed
                        at
                        your own caution!
                    </h1>
                </x-card>
                <div></div>
                <x-button
                    class="!bg-red-800/20 px-4 py-1 !border-red-500/10 generic-hover flex flex-row items-center gap-2 !text-red-300"
                    @click="resetDosboat()" :disabled="isResettingWinboat">
                    <Icon v-if="resetQuestionCounter < 3" icon="mdi:bomb" class="size-8"></Icon>
                    <x-throbber v-else class="size-8"></x-throbber>

                    <span v-if="resetQuestionCounter === 0">Reset DOSBoat & Remove VM</span>
                    <span v-else-if="resetQuestionCounter === 1">Are you sure? This action cannot be undone.</span>
                    <span v-else-if="resetQuestionCounter === 2">One final check, are you ABSOLUTELY sure?</span>
                    <span v-else-if="resetQuestionCounter === 3">Resetting DOSBoat...</span>
                </x-button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import ConfigCard from "../components/ConfigCard.vue";
import { computed, onMounted, ref, watch, reactive } from "vue";
import { useRouter } from "vue-router";
import { computedAsync } from "@vueuse/core";
import { Dosboat } from "../lib/winboat";
import { ContainerRuntimes, ContainerStatus } from "../lib/containers/common";
import type { ComposeConfig } from "../../types";
import { getSpecs } from "../lib/specs";
import { Icon } from "@iconify/vue";
import { DosboatConfig } from "../lib/config";
import { USBManager, type PTSerializableDeviceInfo, type PTDeviceDiagnostics } from "../lib/usbmanager";
import { SerialManager, type SerialPortInfo } from "../lib/serialmanager";
import { type Device } from "usb";
import {
    USB_VID_BLACKLIST,
    RESTART_ON_FAILURE,
    RESTART_NO,
    GUEST_QMP_PORT,
    SHARED_DRIVE_LETTERS,
    SHARED_DRIVE_INDEX_BY_LETTER,
    DOS_MEMORY_OPTIONS,
    SERIAL_PORT_PREFIXES,
} from "../lib/constants";
import { ComposePortEntry, ComposePortMapper, Range } from "../utils/port";
const { app }: typeof import("@electron/remote") = require("@electron/remote");
const electron: typeof import("electron") = require("electron").remote || require("@electron/remote");
const os: typeof import("os") = require("node:os");
const fs: typeof import("fs") = require("fs");
const path: typeof import("path") = require("path");
import { DOSBOAT_DIR } from "../lib/constants";
const $router = useRouter();

// For Resources
const compose = ref<ComposeConfig | null>(null);
const numCores = ref(0);
const origNumCores = ref(0);
const maxNumCores = ref(0);
const ramMB = ref(1024);
const origRamMB = ref(1024);
const shareFolder = ref(false);
const origShareFolder = ref(false);
const sharedFolderPath = ref("");
const origSharedFolderPath = ref("");
const origSharedDriveLetter = ref("D");
const origAutoStartContainer = ref(false);
const autoStartContainer = ref(false);
const isApplyingChanges = ref(false);
const resetQuestionCounter = ref(0);
const isResettingWinboat = ref(false);
const resetOptionsVisible = ref(false);
const isUpdatingUSBPrerequisites = ref(false);
const origSerialPorts = ref<string[]>([]);

// For USB Devices
const availableDevices = ref<Device[]>([]);

// For handling the QMP port, as we can't rely on the winboat instance doing this for us.
// A great example is when the container is offline. In that case, winboat's portManager isn't instantiated.
let portMapper = ref<ComposePortMapper | null>(null);
// ^ Has to be reactive for usbPassthroughDisabled computed to trigger.

// For General
const wbConfig = reactive(DosboatConfig.getInstance());
const winboat = Dosboat.getInstance();
const usbManager = USBManager.getInstance();
const serialManager = SerialManager.getInstance();

// Per-device guest attach verification status (lazy / on-demand)
const guestStatus = reactive<Record<string, "unknown" | "checking" | "attached" | "not-attached">>({});

// Device details modal state
const deviceDetailsVisible = ref(false);
const deviceDetailsLoading = ref(false);
const deviceDetailsData = ref<PTDeviceDiagnostics & { device?: PTSerializableDeviceInfo } | null>(null);

// QMP readiness helper (reactive)
const qmpReady = ref(false);

// Poll QMP readiness when VM goes online or when QMP manager appears
watch(winboat.isOnline, async (isOnline) => {
    qmpReady.value = false;
    console.debug("qmpReady -> false (watch triggered)");
    if (!isOnline) return;

    // Wait for QMP Manager to appear and be alive (up to 30s)
    let attempts = 0;
    while (attempts < 30) {
        if (winboat.qmpMgr) {
            try {
                if (await winboat.qmpMgr.isAlive()) {
                    qmpReady.value = true;
                    console.debug("qmpReady -> true");
                    break;
                }
            } catch {
                // ignore and retry
            }
        }
        attempts++;
        await new Promise(r => setTimeout(r, 1000));
    }
    if (!qmpReady.value) console.debug("qmpReady still false after polling");
}, { immediate: true });

const canVerify = computed(() => {
    return (
        typeof usbManager.isDeviceInGuest === "function" ||
        typeof usbManager.getDeviceDiagnostics === "function" ||
        qmpReady.value === true ||
        Boolean(winboat.qmpMgr)
    );
});

// Constants
const USB_BUS_PATH = "/dev/bus/usb:/dev/bus/usb";

function buildSharedDriveArg() {
    const index = SHARED_DRIVE_INDEX_BY_LETTER[wbConfig.config.sharedDriveLetter];
    return `-drive file=fat:rw:/shared,format=raw,if=ide,index=${index}`;
}

function stripSharedDriveArg(args: string) {
    return args.replace(/\s*-drive file=fat:rw:\/shared,format=raw,if=ide,index=\d+/g, "").trim();
}

function stripSerialArgs(args: string) {
    let cleaned = args;
    cleaned = cleaned.replace(/\s*-chardev\s+serial,id=hostserial\d+,path=\/dev\/tty\w+/g, "");
    cleaned = cleaned.replace(/\s*-device\s+isa-serial,chardev=hostserial\d+/g, "");
    return cleaned.trim();
}

onMounted(async () => {
    await assignValues();
});

/**
 * Assigns the initial values from the Compose file to the reactive refs
 * so we can display them and track when a change has been made
 */
async function assignValues() {
    compose.value = Dosboat.readCompose(winboat.containerMgr!.composeFilePath);
    portMapper.value = new ComposePortMapper(compose.value);

    serialManager.refreshPorts();
    origSerialPorts.value = [...serialManager.passedThroughPorts.value];

    numCores.value = Number(compose.value.services.freedos.environment.CPU_CORES);
    origNumCores.value = numCores.value;

    // Parse RAM from environment (e.g., "1G" -> 1024, "512M" -> 512)
    const ramSize = compose.value.services.freedos.environment.RAM_SIZE || "1G";
    let ramMBValue = 1024; // Default to 1M (1024 MB)

    if (ramSize.endsWith("G")) {
        const gbValue = Number(ramSize.slice(0, -1));
        if (!Number.isNaN(gbValue)) {
            ramMBValue = Math.round(gbValue * 1024);
        }
    } else if (ramSize.endsWith("M")) {
        const mbValue = Number(ramSize.slice(0, -1));
        if (!Number.isNaN(mbValue)) {
            // Handle legacy values like "0.5M" which came from old buggy GB-based constants
            // If value is very small (< 100), it's likely a GB value stored as M, so multiply by 1024
            if (mbValue < 100) {
                ramMBValue = Math.round(mbValue * 1024);
            } else {
                ramMBValue = mbValue;
            }
        }
    }

    console.log("[Config] Loaded RAM_SIZE from compose:", ramSize, "-> parsed to", ramMBValue, "MB");

    // Snap to nearest valid memory option
    const validOptions = Object.values(DOS_MEMORY_OPTIONS).sort((a, b) => a - b);
    const nearestOption = validOptions.reduce((prev, curr) =>
        Math.abs(curr - ramMBValue) < Math.abs(prev - ramMBValue) ? curr : prev
    );

    console.log("[Config] Valid memory options:", validOptions);
    console.log("[Config] Snapping", ramMBValue, "MB to nearest option:", nearestOption, "MB");

    ramMB.value = nearestOption;
    origRamMB.value = nearestOption;

    // Find any volume that ends with /shared
    const sharedVolume = compose.value.services.freedos.volumes.find(v => v.includes("/shared"));
    if (sharedVolume) {
        shareFolder.value = true;
        // Extract the path before :/shared
        const [hostPath] = sharedVolume.split(":");
        sharedFolderPath.value = hostPath.replace("${HOME}", os.homedir());
    } else {
        shareFolder.value = false;
        sharedFolderPath.value = "";
    }
    origShareFolder.value = shareFolder.value;
    origSharedFolderPath.value = sharedFolderPath.value;
    origSharedDriveLetter.value = wbConfig.config.sharedDriveLetter;

    autoStartContainer.value = compose.value.services.freedos.restart === RESTART_ON_FAILURE;
    origAutoStartContainer.value = autoStartContainer.value;

    const specs = await getSpecs();
    maxNumCores.value = specs.cpuCores;

    refreshAvailableDevices();
}

/**
 * Saves the currently specified values to the Compose file
 * and then re-assigns the initial values to the reactive refsDOS_MEMORY_OPTIONS[dosMemoryLabel.value]
 */
async function saveCompose() {
    // Convert MB to storage format (e.g., 1024 MB -> "1G", 256 MB -> "256M")
    // Store as "M" for values less than 1024, "G" for 1024+
    let ramSizeStr: string;
    if (ramMB.value < 1024) {
        ramSizeStr = `${ramMB.value}M`;
    } else {
        const ramGB = Math.round(ramMB.value / 1024);
        ramSizeStr = `${ramGB}G`;
    }
    console.log("[Config] Saving RAM as:", ramSizeStr, "(from", ramMB.value, "MB)");
    compose.value!.services.freedos.environment.RAM_SIZE = ramSizeStr;
    compose.value!.services.freedos.environment.CPU_CORES = `${numCores.value}`;

    // Remove any existing shared volume
    const existingSharedVolume = compose.value!.services.freedos.volumes.find(v => v.includes("/shared"));
    if (existingSharedVolume) {
        compose.value!.services.freedos.volumes = compose.value!.services.freedos.volumes.filter(
            v => !v.includes("/shared"),
        );
    }

    // Add the new shared volume if enabled
    if (shareFolder.value && sharedFolderPath.value) {
        const volumeStr = `${sharedFolderPath.value}:/shared`;
        compose.value!.services.freedos.volumes.push(volumeStr);
    }

    if (!compose.value!.services.freedos.environment.ARGUMENTS) {
        compose.value!.services.freedos.environment.ARGUMENTS = "";
    }

    // Strip both QMP and shared drive arguments (QMP is now in entrypoint.sh)
    compose.value!.services.freedos.environment.ARGUMENTS = stripSharedDriveArg(
        compose.value!.services.freedos.environment.ARGUMENTS,
    ).replace(/\s*-qmp\s+tcp:0\.0\.0\.0:7149,server,wait=off/g, "").trim();

    compose.value!.services.freedos.environment.ARGUMENTS = stripSerialArgs(
        compose.value!.services.freedos.environment.ARGUMENTS,
    );

    if (shareFolder.value && sharedFolderPath.value) {
        compose.value!.services.freedos.environment.ARGUMENTS =
            `${compose.value!.services.freedos.environment.ARGUMENTS} ${buildSharedDriveArg()}`.trim();
    }

    const serialPorts = [...serialManager.passedThroughPorts.value];
    const portPrefixes = SERIAL_PORT_PREFIXES.map(prefix => `/dev/${prefix}`);
    compose.value!.services.freedos.devices = (compose.value!.services.freedos.devices ?? []).filter(
        device => !portPrefixes.some(prefix => device.includes(prefix)),
    );

    if (serialPorts.length > 0) {
        for (const port of serialPorts) {
            const mapping = `${port}:${port}`;
            if (!compose.value!.services.freedos.devices.includes(mapping)) {
                compose.value!.services.freedos.devices.push(mapping);
            }
        }

        const serialArgs = serialManager.generateQemuSerialArgs();
        if (serialArgs) {
            compose.value!.services.freedos.environment.ARGUMENTS =
                `${compose.value!.services.freedos.environment.ARGUMENTS} ${serialArgs}`.trim();
        }
    }

    compose.value!.services.freedos.restart = autoStartContainer.value ? RESTART_ON_FAILURE : RESTART_NO;

    compose.value!.services.freedos.ports = portMapper.value!.composeFormat;

    isApplyingChanges.value = true;
    try {
        await winboat.replaceCompose(compose.value!);
        await assignValues();
    } catch (e) {
        console.error("Failed to apply changes");
        console.error(e);
    } finally {
        isApplyingChanges.value = false;
    }
}

/**
 * Opens a dialog to select a folder to share with FreeDOS
 */
function selectSharedFolder() {
    electron.dialog
        .showOpenDialog({
            title: "Select Folder to Share with FreeDOS",
            properties: ["openDirectory"],
            defaultPath: sharedFolderPath.value || os.homedir(),
        })
        .then(result => {
            if (!result.canceled && result.filePaths.length > 0) {
                sharedFolderPath.value = result.filePaths[0];
            }
        });
}

/**
 * Adds the required fields for USB passthrough to work
 * to the Compose file if they don't already exist
 */
async function addRequiredComposeFieldsUSB() {
    if (!usbPassthroughDisabled.value) {
        return;
    }

    isUpdatingUSBPrerequisites.value = true;
    await winboat.stopContainer();

    if (!hasUsbVolume(compose)) {
        compose.value!.services.freedos.volumes.push(USB_BUS_PATH);
    }
    if (!hasQmpPort()) {
        const composePorts = winboat.containerMgr!.defaultCompose.services.freedos.ports;
        const portEntries = composePorts.filter(x => typeof x === "string").map(x => new ComposePortEntry(x));
        const QMPPredicate = (entry: ComposePortEntry) =>
            (entry.host instanceof Range || Number.isNaN(entry.host)) && // We allow NaN in case the QMP port entry isn't already there on podman for whatever reason
            typeof entry.container === "number" &&
            entry.container === GUEST_QMP_PORT;
        const QMPPort = portEntries.find(QMPPredicate)!.host;

        portMapper.value!.setShortPortMapping(GUEST_QMP_PORT, QMPPort, {
            protocol: "tcp",
            hostIP: "127.0.0.1",
        });
    }

    if (!compose.value!.services.freedos.environment.ARGUMENTS) {
        compose.value!.services.freedos.environment.ARGUMENTS = "";
    }
    // QMP argument is now in entrypoint.sh, no longer needed in ARGUMENTS

    if (!compose.value!.services.freedos.environment.HOST_PORTS) {
        compose.value!.services.freedos.environment.HOST_PORTS = "";
    }
    if (!hasHostPort(compose)) {
        const delimiter = compose.value!.services.freedos.environment.HOST_PORTS.length == 0 ? "" : ",";
        compose.value!.services.freedos.environment.HOST_PORTS += delimiter + GUEST_QMP_PORT;
    }

    await saveCompose();

    isUpdatingUSBPrerequisites.value = false;
}

const errors = computedAsync(async () => {
    let errCollection: string[] = [];

    if (!numCores.value || numCores.value < 1) {
        errCollection.push("You must allocate at least one CPU core for FreeDOS to run properly");
    }

    if (numCores.value > maxNumCores.value) {
        errCollection.push("You cannot allocate more RAM to FreeDOS than you have available");
    }

    return errCollection;
});

const hasUsbVolume = (_compose: typeof compose) =>
    _compose.value?.services.freedos.volumes?.some(x => x.includes(USB_BUS_PATH));
const hasQmpPort = () => portMapper.value!.hasShortPortMapping(GUEST_QMP_PORT) ?? false;
const hasHostPort = (_compose: typeof compose) =>
    _compose.value?.services.freedos.environment.HOST_PORTS?.includes(GUEST_QMP_PORT.toString());

const memoryOptionsMB = computed(() => {
    return Object.values(DOS_MEMORY_OPTIONS).sort((a, b) => a - b);
});

const ramMBToLabel = computed(() => {
    const map: { [key: number]: string } = {};
    Object.entries(DOS_MEMORY_OPTIONS).forEach(([label, mb]) => {
        map[mb] = label;
    });
    return map;
});

const usbPassthroughDisabled = computed(() => {
    return !hasUsbVolume(compose) || !hasQmpPort() || !hasHostPort(compose);
});

const saveButtonDisabled = computed(() => {
    const hasResourceChanges =
        origNumCores.value !== numCores.value ||
        origRamMB.value !== ramMB.value ||
        shareFolder.value !== origShareFolder.value ||
        sharedFolderPath.value !== origSharedFolderPath.value ||
        origSharedDriveLetter.value !== wbConfig.config.sharedDriveLetter ||
        autoStartContainer.value !== origAutoStartContainer.value ||
        JSON.stringify([...origSerialPorts.value].sort()) !==
            JSON.stringify([...serialManager.passedThroughPorts.value].sort());

    const shouldBeDisabled = errors.value?.length || !hasResourceChanges || isApplyingChanges.value;

    return shouldBeDisabled;
});

async function resetDosboat() {
    if (++resetQuestionCounter.value < 3) {
        return;
    }

    isResettingWinboat.value = true;
    try {
        await winboat.resetDosboat();
        resetOptionsVisible.value = true;
    } catch (error) {
        console.error("Failed to reset DOSBoat:", error);
        isResettingWinboat.value = false;
    }
}

function startSetupAfterReset() {
    resetOptionsVisible.value = false;
    isResettingWinboat.value = false;
    $router.push("/setup");
}

function closeAfterReset() {
    app.exit();
}

// Reactivity utterly fails here, so we use this function to
// refresh via the button
function refreshAvailableDevices() {
    availableDevices.value = usbManager.devices.value.filter(device => {
        return (
            !usbManager.isDeviceInPassthroughList(device) &&
            !USB_VID_BLACKLIST.some(x => usbManager.stringifyDevice(device).includes(x))
        );
    });
    console.info("[Available Devices] Debug", availableDevices.value);
}

function addDevice(device: Device): void {
    try {
        usbManager.addDeviceToPassthroughList(device);
        refreshAvailableDevices();
    } catch (error) {
        console.error("Failed to add device to passthrough list:", error);
    }
}

function removeDevice(ptDevice: PTSerializableDeviceInfo): void {
    try {
        usbManager.removeDeviceFromPassthroughList(ptDevice);
        refreshAvailableDevices();
    } catch (error) {
        console.error("Failed to remove device from passthrough list:", error);
    }
}

function toggleSerialPort(portPath: string) {
    if (serialManager.isPortPassedThrough(portPath)) {
        serialManager.removePort(portPath);
    } else {
        serialManager.addPort(portPath);
    }
}

async function toggleExperimentalFeatures() {
    // Remove all passthrough USB devices if we're disabling experimental features
    // since USB passthrough is an experimental feature
    if (!wbConfig.config.experimentalFeatures) {
        await usbManager.removeAllPassthroughDevicesAndConfig();

        // Create the QMP interval if experimental features are enabled
        // This would get created by default since we're changing the compose and re-deploying,
        // but a scenario could also occur where the user is re-enabling experimental features
        // after the compose changes, which then would cause a bug
        // TODO: Remove after USB passthrough is no longer experimental
    } else if (winboat.containerStatus.value == ContainerStatus.RUNNING && !winboat.hasQMPInterval) {
        console.log("Creating QMP interval because experimental features were turned on");
        winboat.createQMPInterval();
    }
}

// Watch for when shared folder is enabled and set default path
watch(shareFolder, (newValue) => {
    if (newValue && !sharedFolderPath.value) {
        sharedFolderPath.value = os.homedir();
    }
});

// Watch for USB device changes and refresh available devices list
watch(usbManager.devices, async () => {
    refreshAvailableDevices();

    // Auto-verify any passthrough devices that are now connected on the host
    // (helps when user unplugs/re-plugs a device)
    if (!usbManager.ptDevices.value.length) return;

    for (const pt of usbManager.ptDevices.value) {
        if (usbManager.isPTDeviceConnected(pt)) {
            // Run verification but don't block the watcher
            void verifyDeviceInGuest(pt).catch(e => console.error("auto-verify failed:", e));
        }
    }
});

// Helper: device key for maps
function _deviceKey(device: PTSerializableDeviceInfo) {
    return `${device.vendorId}-${device.productId}`;
}

// Verify whether PT device exists in the guest (updates guestStatus)
async function verifyDeviceInGuest(device?: PTSerializableDeviceInfo | null) {
    if (!device) return false;
    const key = _deviceKey(device);
    guestStatus[key] = "checking";

    // Wait briefly for verification APIs or QMP to become available (helps with timing races)
    const waitUntil = Date.now() + 8000; // 8s max
    while (Date.now() < waitUntil) {
        if (
            typeof usbManager.isDeviceInGuest === "function" ||
            typeof usbManager.getDeviceDiagnostics === "function" ||
            qmpReady.value === true ||
            (winboat.qmpMgr && (await winboat.qmpMgr.isAlive()))
        ) {
            break;
        }
        // small backoff
        await new Promise(r => setTimeout(r, 250));
    }

    // Preferred API (if available)
    if (typeof usbManager.isDeviceInGuest === "function") {
        try {
            const inGuest = await usbManager.isDeviceInGuest(device.vendorId, device.productId);
            guestStatus[key] = inGuest ? "attached" : "not-attached";
            return inGuest;
        } catch (e) {
            console.error("verifyDeviceInGuest (isDeviceInGuest):", e);
            // fallthrough to other checks
        }
    }

    // Fallback: diagnostics API
    if (typeof usbManager.getDeviceDiagnostics === "function") {
        try {
            const diag = await usbManager.getDeviceDiagnostics(device.vendorId, device.productId);
            guestStatus[key] = diag.inGuest ? "attached" : "not-attached";
            return diag.inGuest;
        } catch (e) {
            console.error("verifyDeviceInGuest (getDeviceDiagnostics):", e);
            // fallthrough
        }
    }

    // QMP fallback: poll qtree a few times (tolerate small timing races after device_add)
    if (winboat.qmpMgr && (await winboat.qmpMgr.isAlive())) {
        try {
            const vendorIdHex = device.vendorId.toString(16).padStart(4, "0");
            const productIdHex = device.productId.toString(16).padStart(4, "0");
            let inGuest = false;
            const attempts = 6;
            for (let attempt = 0; attempt < attempts; attempt++) {
                try {
                    const response = await winboat.qmpMgr.executeCommand("human-monitor-command", {
                        "command-line": "info qtree",
                    });
                    // @ts-ignore
                    const raw = response && ("return" in response ? response.return : response);
                    let qtreeOutput: string;
                    if (typeof raw === "string") qtreeOutput = raw;
                    else if (Array.isArray(raw)) qtreeOutput = raw.join("\n");
                    else qtreeOutput = JSON.stringify(raw);

                    const deviceLines = qtreeOutput
                        .split("\n")
                        .filter((l: string) => l.includes("usb-host") || l.includes(vendorIdHex) || l.includes(productIdHex));
                    inGuest = deviceLines.some(l => /usb-host/.test(l));

                    if (inGuest) {
                        guestStatus[key] = "attached";
                        console.debug(`verifyDeviceInGuest: device ${key} found in qtree (attempt ${attempt + 1})`);
                        return true;
                    }
                } catch (e) {
                    // ignore and retry
                    console.debug(`verifyDeviceInGuest: qtree attempt ${attempt + 1} failed:`, e);
                }

                // Wait before retrying
                await new Promise(r => setTimeout(r, 500));
            }

            guestStatus[key] = "not-attached";
            console.debug(`verifyDeviceInGuest: device ${key} not found after ${attempts} qtree attempts`);
            return false;
        } catch (e) {
            console.error("verifyDeviceInGuest (QMP fallback):", e);
            guestStatus[key] = "not-attached";
            return false;
        }
    }

    // Last resort: helpful debug info
    console.error(
        "USBManager.isDeviceInGuest and getDeviceDiagnostics are not available",
        Object.keys(usbManager || {}).sort(),
        { ctor: usbManager?.constructor?.name, proto: Object.getPrototypeOf(usbManager) },
    );
    guestStatus[key] = "not-attached";
    return false;
}

// Show details modal for a device (qtree + recent logs)
async function showDeviceDetails(device: PTSerializableDeviceInfo) {
    deviceDetailsVisible.value = true;
    deviceDetailsLoading.value = true;
    deviceDetailsData.value = { device, inGuest: undefined, qtreeFull: "", qtreeDeviceLines: [], qmpLogTail: "", dosboatLogTail: "" } as any;

    // Prefer USBManager.getDeviceDiagnostics when available
    if (typeof usbManager.getDeviceDiagnostics === "function") {
        try {
            const diag = await usbManager.getDeviceDiagnostics(device.vendorId, device.productId);
            deviceDetailsData.value = { device, ...diag } as any;
            const key = _deviceKey(device);
            guestStatus[key] = diag.inGuest ? "attached" : "not-attached";
            deviceDetailsLoading.value = false;
            return;
        } catch (e) {
            console.warn("getDeviceDiagnostics failed, falling back to local QMP/log read", e);
            // fall-through to fallback logic
        }
    }

    // Fallback: query QMP directly and read recent logs from disk
    try {
        let qtreeFull = "QMP not available";
        let qtreeDeviceLines: string[] = [];
        let inGuest = false;

        if (winboat.qmpMgr && (await winboat.qmpMgr.isAlive())) {
            try {
                const response = await winboat.qmpMgr.executeCommand("human-monitor-command", {
                    "command-line": "info qtree",
                });
                // Normalize qtree response into a string
                // @ts-ignore
                const qraw = response && ("return" in response ? response.return : response);
                if (typeof qraw === "string") {
                    qtreeFull = qraw;
                } else if (Array.isArray(qraw)) {
                    qtreeFull = qraw.join("\n");
                } else {
                    qtreeFull = JSON.stringify(qraw);
                }

                const vendorIdHex = device.vendorId.toString(16).padStart(4, "0");
                const productIdHex = device.productId.toString(16).padStart(4, "0");
                qtreeDeviceLines = qtreeFull
                    .split("\n")
                    .filter((l: string) => l.includes("usb-host") || l.includes(vendorIdHex) || l.includes(productIdHex));
                inGuest = qtreeDeviceLines.some(l => /usb-host/.test(l));
            } catch (e) {
                qtreeFull = `Error getting qtree: ${String(e)}`;
            }
        }

        let qmpLogTail = "qmp.log not found";
        let dosboatLogTail = "dosboat.log not found";
        try {
            const qmpLogPath = path.join(DOSBOAT_DIR, "qmp.log");
            if (fs.existsSync(qmpLogPath)) qmpLogTail = fs.readFileSync(qmpLogPath, "utf8").split("\n").slice(-120).join("\n");
        } catch (e) {
            qmpLogTail = `Error reading qmp.log: ${String(e)}`;
        }

        try {
            const dosboatLogPath = path.join(DOSBOAT_DIR, "dosboat.log");
            if (fs.existsSync(dosboatLogPath)) dosboatLogTail = fs.readFileSync(dosboatLogPath, "utf8").split("\n").slice(-120).join("\n");
        } catch (e) {
            dosboatLogTail = `Error reading dosboat.log: ${String(e)}`;
        }

        deviceDetailsData.value = { device, inGuest, qtreeFull, qtreeDeviceLines, qmpLogTail, dosboatLogTail } as any;
        const key = _deviceKey(device);
        guestStatus[key] = inGuest ? "attached" : "not-attached";
        console.debug(`showDeviceDetails: used QMP/log fallback for ${key} (inGuest=${inGuest})`);
    } catch (e) {
        deviceDetailsData.value = { device, inGuest: false, qtreeFull: `Error: ${String(e)}`, qtreeDeviceLines: [], qmpLogTail: "", dosboatLogTail: "" } as any;
    } finally {
        deviceDetailsLoading.value = false;
    }
}

// Keep guestStatus map cleaned up when passthrough list changes
watch(usbManager.ptDevices, async () => {
    const present = new Set(usbManager.ptDevices.value.map(d => `${d.vendorId}-${d.productId}`));
    for (const k of Object.keys(guestStatus)) {
        if (!present.has(k)) delete guestStatus[k];
    }

    // If the VM is online, auto-verify the currently configured passthrough devices
    if (winboat.isOnline.value && usbManager.ptDevices.value.length) {
        // Wait briefly for QMP to become available (USBManager also does retries on its side)
        let attempts = 0;
        while (attempts < 30) {
            if (winboat.qmpMgr && (await winboat.qmpMgr.isAlive())) break;
            await new Promise(r => setTimeout(r, 1000));
            attempts++;
        }

        // Run verifications in parallel (fire-and-forget is fine because verifyDeviceInGuest updates UI state)
        await Promise.all(usbManager.ptDevices.value.map(d => verifyDeviceInGuest(d)));
    }
}, { deep: true });

// Auto-verify devices when the VM becomes online
watch(winboat.isOnline, async (isOnline) => {
    if (!isOnline) return;

    // Wait for QMP Manager to be ready (tries for up to 30s)
    let attempts = 0;
    while (attempts < 30) {
        if (winboat.qmpMgr && (await winboat.qmpMgr.isAlive())) break;
        await new Promise(r => setTimeout(r, 1000));
        attempts++;
    }

    if (usbManager.ptDevices.value.length) {
        await Promise.all(usbManager.ptDevices.value.map(d => verifyDeviceInGuest(d)));
    }
});
</script>

<style scoped>
.devices-move,
.devices-enter-active,
.devices-leave-active,
.menu-move,
.menu-enter-active,
.menu-leave-active {
    transition: all 0.5s ease;
}

.devices-enter-from,
.devices-leave-to {
    opacity: 0;
    transform: translateX(30px);
}

.devices-leave-active,
.menu-leave-active {
    position: absolute;
}

.menu-enter-from,
.menu-leave-to {
    opacity: 0;
    transform: translateX(20px) scale(0.9);
}
</style>
