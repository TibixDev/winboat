<template>
    <div class="grid grid-cols-3 2xl:grid-cols-1 gap-2">
        <ConfigButton
            v-for="(token, key) in routes.filter(x => x.path.startsWith('/Configuration/'))!.map(x => splitRoute(x.path).at(-1)!)"
            :icon="token.icon!"
            :title="token.token"
            :key="key"
            desc="lorem ipsum"
        />
    </div>
</template>

<script setup lang="ts">
import ConfigCard from "../components/ConfigCard.vue";
import ConfigButton from "../components/ConfigButton.vue";
import { computed, onMounted, ref, watch, reactive } from "vue";
import { computedAsync } from "@vueuse/core";
import { Winboat } from "../lib/winboat";
import { ContainerRuntimes, ContainerStatus } from "../lib/containers/common";
import type { ComposeConfig } from "../../types";
import { getSpecs } from "../lib/specs";
import { Icon } from "@iconify/vue";
import { MultiMonitorMode, RdpArg, WinboatConfig } from "../lib/config";
import { USBManager, type PTSerializableDeviceInfo } from "../lib/usbmanager";
import { type Device } from "usb";
import {
    USB_VID_BLACKLIST,
    RESTART_ON_FAILURE,
    RESTART_NO,
    GUEST_RDP_PORT,
    GUEST_QMP_PORT,
} from "../lib/constants";
import { ComposePortEntry, ComposePortMapper, Range } from "../utils/port";
import { useRouter } from "vue-router";
import { routes, splitRoute } from "../router";
const { app }: typeof import("@electron/remote") = require("@electron/remote");

console.log(routes.filter(x => x.path.startsWith('/Configuration/'))!.map(x => splitRoute(x.path)));
console.log(routes.filter(x => x.path.startsWith('/Configuration/'))!.map(x => splitRoute(x.path)));

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
const origAutoStartContainer = ref(false);
const autoStartContainer = ref(false);
const freerdpPort = ref(0);
const origFreerdpPort = ref(0);
const isApplyingChanges = ref(false);
const resetQuestionCounter = ref(0);
const isResettingWinboat = ref(false);
const isUpdatingUSBPrerequisites = ref(false);

// For USB Devices
const availableDevices = ref<Device[]>([]);

// For handling the QMP port, as we can't rely on the winboat instance doing this for us.
// A great example is when the container is offline. In that case, winboat's portManager isn't instantiated.
let portMapper = ref<ComposePortMapper | null>(null);
// ^ Has to be reactive for usbPassthroughDisabled computed to trigger.

// For General
const wbConfig = reactive(WinboatConfig.getInstance());
const winboat = Winboat.getInstance();
const usbManager = USBManager.getInstance();
const router = useRouter();

// Constants
const HOMEFOLDER_SHARE_STR = winboat.containerMgr!.defaultCompose.services.windows.volumes.find(v => v.startsWith("${HOME}"))!;
const USB_BUS_PATH = "/dev/bus/usb:/dev/bus/usb";
const QMP_ARGUMENT = "-qmp tcp:0.0.0.0:7149,server,wait=off"; // 7149 can remain hardcoded as it refers to a guest port

onMounted(async () => {
    await assignValues();
});

/**
 * Assigns the initial values from the Compose file to the reactive refs
 * so we can display them and track when a change has been made
 */
async function assignValues() {
    compose.value = Winboat.readCompose(winboat.containerMgr!.composeFilePath);
    portMapper.value = new ComposePortMapper(compose.value);

    numCores.value = Number(compose.value.services.windows.environment.CPU_CORES);
    origNumCores.value = numCores.value;

    ramGB.value = Number(compose.value.services.windows.environment.RAM_SIZE.split("G")[0]);
    origRamGB.value = ramGB.value;

    shareHomeFolder.value = compose.value.services.windows.volumes.includes(HOMEFOLDER_SHARE_STR);
    origShareHomeFolder.value = shareHomeFolder.value;

    autoStartContainer.value = compose.value.services.windows.restart === RESTART_ON_FAILURE;
    origAutoStartContainer.value = autoStartContainer.value;

    freerdpPort.value = (portMapper.value.getShortPortMapping(GUEST_RDP_PORT)?.host as number) ?? GUEST_RDP_PORT;
    origFreerdpPort.value = freerdpPort.value;

    const specs = await getSpecs();
    maxRamGB.value = specs.ramGB;
    maxNumCores.value = specs.cpuCores;

    refreshAvailableDevices();
}

/**
 * Saves the currently specified values to the Compose file
 * and then re-assigns the initial values to the reactive refs
 */
async function saveCompose() {
    compose.value!.services.windows.environment.RAM_SIZE = `${ramGB.value}G`;
    compose.value!.services.windows.environment.CPU_CORES = `${numCores.value}`;

    const composeHasHomefolderShare = compose.value!.services.windows.volumes.includes(HOMEFOLDER_SHARE_STR);

    if (shareHomeFolder.value && !composeHasHomefolderShare) {
        compose.value!.services.windows.volumes.push(HOMEFOLDER_SHARE_STR);
    } else if (!shareHomeFolder.value && composeHasHomefolderShare) {
        compose.value!.services.windows.volumes = compose.value!.services.windows.volumes.filter(
            v => v !== HOMEFOLDER_SHARE_STR,
        );
    }

    compose.value!.services.windows.restart = autoStartContainer.value ? RESTART_ON_FAILURE : RESTART_NO;

    portMapper.value!.setShortPortMapping(GUEST_RDP_PORT, freerdpPort.value, {
        protocol: "tcp",
        hostIP: "127.0.0.1",
    });

    portMapper.value!.setShortPortMapping(GUEST_RDP_PORT, freerdpPort.value, {
        protocol: "udp",
        hostIP: "127.0.0.1",
    });

    compose.value!.services.windows.ports = portMapper.value!.composeFormat;

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

    if (!compose.value!.services.windows.environment.ARGUMENTS) {
        compose.value!.services.windows.environment.ARGUMENTS = "";
    }
    if (!hasQmpArgument(compose)) {
        compose.value!.services.windows.environment.ARGUMENTS += `\n${QMP_ARGUMENT}`;
    }

    if (!compose.value!.services.windows.environment.HOST_PORTS) {
        compose.value!.services.windows.environment.HOST_PORTS = "";
    }
    if (!hasHostPort(compose)) {
        const delimiter = compose.value!.services.windows.environment.HOST_PORTS.length == 0 ? "" : ",";
        compose.value!.services.windows.environment.HOST_PORTS += delimiter + GUEST_QMP_PORT;
    }

    await saveCompose();

    isUpdatingUSBPrerequisites.value = false;
}

const errors = computedAsync(async () => {
    let errCollection: string[] = [];

    if (!numCores.value || numCores.value < 2) {
        errCollection.push("You must allocate at least two CPU cores for Windows to run properly");
    }

    if (numCores.value > maxNumCores.value) {
        errCollection.push("You cannot allocate more CPU cores to Windows than you have available");
    }

    if (!ramGB.value || ramGB.value < 4) {
        errCollection.push("You must allocate at least 4 GB of RAM for Windows to run properly");
    }

    if (ramGB.value > maxRamGB.value) {
        errCollection.push("You cannot allocate more RAM to Windows than you have available");
    }

    if (
        freerdpPort.value !== origFreerdpPort.value &&
        !Number.isNaN(freerdpPort.value) &&
        !(await ComposePortMapper.isPortOpen(freerdpPort.value))
    ) {
        errCollection.push("You must choose an open port for your FreeRDP port!");
    }

    return errCollection;
});

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

const saveButtonDisabled = computed(() => {
    const hasResourceChanges =
        origNumCores.value !== numCores.value ||
        origRamGB.value !== ramGB.value ||
        shareHomeFolder.value !== origShareHomeFolder.value ||
        (!Number.isNaN(freerdpPort.value) && freerdpPort.value !== origFreerdpPort.value) ||
        autoStartContainer.value !== origAutoStartContainer.value;

    const shouldBeDisabled = errors.value?.length || !hasResourceChanges || isApplyingChanges.value;

    return shouldBeDisabled;
});

async function resetWinboat() {
    if (++resetQuestionCounter.value < 3) {
        return;
    }

    isResettingWinboat.value = true;
    await winboat.resetWinboat();
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
