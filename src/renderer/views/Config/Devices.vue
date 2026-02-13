<template>
    <div class="flex flex-col mt-12">
        <div class="flex flex-col gap-4 opening-transition self-center max-w-full w-[84rem] ease-in">
            <ConfigCard
                icon="game-icons:swipe-card"
                title="Smartcard Passthrough"
                desc="If enabled, your smartcard readers will be passed to Windows when you start an app"
                type="switch"
                v-model:value="wbConfig.config.smartcardEnabled"
            />

            <x-card
                class="flex relative z-20 flex-row justify-between items-center p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20"
                :class="{ 'brightness-75 opacity-50 blur-sm pointer-events-none': !wbConfig.config.experimentalFeatures }"
            >
                <div class="w-full">
                    <div class="flex flex-row gap-2 items-center mb-2">
                        <Icon class="inline-flex text-violet-400 size-8" icon="fluent:tv-usb-24-filled"></Icon>
                        <h1 class="my-0 text-lg font-semibold">
                            USB Passthrough
                            <span class="bg-violet-500 rounded-full px-3 py-0.5 text-sm ml-2"> Experimental </span>
                        </h1>
                    </div>

                    <template v-if="usbPassthroughDisabled || isUpdatingUSBPrerequisites">
                        <x-card
                            class="flex items-center py-2 w-full my-2 backdrop-blur-xl gap-4 backdrop-brightness-150 bg-yellow-200/10"
                        >
                            <Icon class="inline-flex text-yellow-500 size-8" icon="clarity:warning-solid"></Icon>
                            <h1 class="my-0 text-base font-normal text-yellow-200">
                                We need to update your Compose in order to use this feature!
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
                    <template v-if="wbConfig.config.containerRuntime === ContainerRuntimes.PODMAN">
                        <x-card
                            class="flex items-center py-2 w-full my-2 backdrop-blur-xl gap-4 backdrop-brightness-150 bg-yellow-200/10"
                        >
                            <Icon class="inline-flex text-yellow-500 size-8" icon="clarity:warning-solid"></Icon>
                            <h1 class="my-0 text-base font-normal text-yellow-200">
                                USB Passthrough is not yet supported while using Podman as the container runtime.
                            </h1>
                        </x-card>
                    </template>
                    <template
                        v-if="
                            !usbPassthroughDisabled &&
                            !isUpdatingUSBPrerequisites &&
                            wbConfig.config.containerRuntime === ContainerRuntimes.DOCKER
                        "
                    >
                        <x-label
                            class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0"
                            v-if="usbManager.ptDevices.value.length == 0"
                        >
                            Press the button below to add USB devices to your passthrough list
                        </x-label>
                        <TransitionGroup name="devices" tag="x-box" class="flex-col gap-2 mt-4">
                            <x-card
                                class="flex justify-between items-center px-2 py-0 m-0 bg-white/5"
                                v-for="device of usbManager.ptDevices.value"
                                :key="`${device.vendorId}-${device.productId}`"
                                :class="{
                                    'bg-white/[calc(0.05*0.75)] [&_*:not(div):not(span)]:opacity-75':
                                        !usbManager.isPTDeviceConnected(device),
                                }"
                            >
                                <div class="flex flex-row gap-2 items-center">
                                    <span
                                        v-if="
                                            usbManager.isMTPDevice(device) ||
                                            usbManager
                                                .stringifyPTSerializableDevice(device)
                                                .toLowerCase()
                                                .includes('mtp')
                                        "
                                        class="relative group"
                                    >
                                        <Icon
                                            icon="clarity:warning-solid"
                                            class="text-yellow-300 size-7 cursor-pointer"
                                        />
                                        <span
                                            class="absolute bottom-5 z-50 w-[320px] bg-neutral-800/90 backdrop-blur-sm text-xs text-gray-300 rounded-lg shadow-lg px-3 py-2 hidden group-hover:block transition-opacity duration-200 pointer-events-none"
                                        >
                                            This device appears to be using the MTP protocol, which is known for
                                            being problematic. Some Desktop Environments automatically mount MTP
                                            devices, which in turn causes WinBoat to not be able to pass the device
                                            through.
                                        </span>
                                    </span>

                                    <span v-if="!usbManager.isPTDeviceConnected(device)" class="relative group">
                                        <Icon
                                            icon="ix:connection-fail"
                                            class="text-red-500 size-7 cursor-pointer"
                                        />
                                        <span
                                            class="absolute bottom-5 z-50 w-[320px] bg-neutral-800/90 backdrop-blur-sm text-xs text-gray-300 rounded-lg shadow-lg px-3 py-2 hidden group-hover:block transition-opacity duration-200 pointer-events-none"
                                        >
                                            This device is currently not connected.
                                        </span>
                                    </span>

                                    <p class="text-base !m-0 text-gray-200">
                                        {{ usbManager.stringifyPTSerializableDevice(device) }}
                                    </p>
                                </div>
                                <x-button
                                    @click="removeDevice(device)"
                                    class="mt-1 !bg-gradient-to-tl from-red-500/20 to-transparent hover:from-red-500/30 transition !border-0"
                                >
                                    <x-icon href="#remove"></x-icon>
                                </x-button>
                            </x-card>
                        </TransitionGroup>
                        <x-button
                            v-if="availableDevices.length > 0"
                            class="!bg-gradient-to-tl from-blue-400/20 shadow-md shadow-blue-950/20 to-transparent hover:from-blue-400/30 transition"
                            :class="{ 'mt-4': usbManager.ptDevices.value.length }"
                            @click="refreshAvailableDevices()"
                        >
                            <x-icon href="#add"></x-icon>
                            <x-label>Add Device</x-label>
                            <TransitionGroup ref="usbMenu" name="menu" tag="x-menu" class="max-h-52">
                                <x-menuitem
                                    v-for="(device, k) of availableDevices as Device[]"
                                    :key="device.portNumbers.join(',')"
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
                </div>
            </x-card>
        </div>
    </div>
</template>


<script setup lang="ts">
import { Icon } from "@iconify/vue";
import ConfigCard from "../../components/ConfigCard.vue";
import { computed, onMounted, ref, reactive } from "vue";
import { Winboat } from "../../lib/winboat";
import { ContainerRuntimes } from "../../lib/containers/common";
import type { ComposeConfig } from "../../../types";
import { WinboatConfig } from "../../lib/config";
import { USBManager, type PTSerializableDeviceInfo } from "../../lib/usbmanager";
import { type Device } from "usb";
import {
    USB_VID_BLACKLIST,
    GUEST_QMP_PORT,
} from "../../lib/constants";
import { ComposePortEntry, ComposePortMapper, Range } from "../../utils/port";
const { app }: typeof import("@electron/remote") = require("@electron/remote");

// For General
const wbConfig = reactive(WinboatConfig.getInstance());
const winboat = Winboat.getInstance();
const usbManager = USBManager.getInstance();

// For Resources
const compose = ref<ComposeConfig | null>(null);
const isUpdatingUSBPrerequisites = ref(false);

// For USB Devices
const availableDevices = ref<Device[]>([]);

// For handling the QMP port, as we can't rely on the winboat instance doing this for us.
// A great example is when the container is offline. In that case, winboat's portManager isn't instantiated.
let portMapper = ref<ComposePortMapper | null>(null);
// ^ Has to be reactive for usbPassthroughDisabled computed to trigger.

// Constants
const HOMEFOLDER_SHARE_STR = winboat.containerMgr!.defaultCompose.services.windows.volumes.find(v => v.startsWith("${HOME}"))!;
const USB_BUS_PATH = "/dev/bus/usb:/dev/bus/usb";
const QMP_ARGUMENT = "-qmp tcp:0.0.0.0:7149,server,wait=off"; // 7149 can remain hardcoded as it refers to a guest port

const hasUsbVolume = (_compose: typeof compose) =>
    _compose.value?.services.windows.volumes?.some(x => x.includes(USB_BUS_PATH));
const hasQmpArgument = (_compose: typeof compose) =>
    _compose.value?.services.windows.environment.ARGUMENTS?.includes(QMP_ARGUMENT);
const hasQmpPort = () => portMapper.value!.hasShortPortMapping(GUEST_QMP_PORT) ?? false;
const hasHostPort = (_compose: typeof compose) =>
    _compose.value?.services.windows.environment.HOST_PORTS?.includes(GUEST_QMP_PORT.toString());

const usbPassthroughDisabled = computed(() => {
    return !hasUsbVolume(compose) || !hasQmpArgument(compose) || !hasQmpPort() || !hasHostPort(compose);
});

onMounted(() => {
    compose.value = Winboat.readCompose(winboat.containerMgr!.composeFilePath);
    portMapper.value = new ComposePortMapper(compose.value);
    refreshAvailableDevices();
})

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
        compose.value!.services.windows.volumes.push(USB_BUS_PATH);
    }
    if (!hasQmpPort()) {
        const composePorts = winboat.containerMgr!.defaultCompose.services.windows.ports;
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


    if (!hasQmpArgument(compose)) {
        compose.value!.services.windows.environment.ARGUMENTS ||= "";
        compose.value!.services.windows.environment.ARGUMENTS += `\n${QMP_ARGUMENT}`;
    }

    if (!hasHostPort(compose)) {
        const delimiter = compose.value!.services.windows.environment.HOST_PORTS ? "" : ",";

        compose.value!.services.windows.environment.HOST_PORTS ||= "";
        compose.value!.services.windows.environment.HOST_PORTS += delimiter + GUEST_QMP_PORT;
    }

    try {
        await winboat.replaceCompose(compose.value!);
    } catch (e) {
        console.error("Failed to apply changes");
        console.error(e);
    }

    isUpdatingUSBPrerequisites.value = false;
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
</script>   