<template>
    <div class="flex flex-col overflow-x-hidden mt-12 2xl:translate-y-[3rem]" :class="{ hidden: !maxNumCores }">
        <div class="flex flex-col gap-4 opening-transition self-center w-full 2xl:w-[74rem] ease-in">
            <!-- RAM Allocation -->
            <ConfigCard
                icon="game-icons:ram"
                title="RAM Allocation"
                desc="How many gigabytes of RAM are allocated to the Windows virtual machine"
                type="number"
                unit="GB"
                :min="2"
                :max="maxRamGB"
                v-model:value="ramGB"
            />

            <!-- CPU Cores -->
            <ConfigCard
                icon="solar:cpu-bold"
                title="CPU Cores"
                desc="How many CPU Cores are allocated to the Windows virtual machine"
                type="number"
                unit="Cores"
                :min="2"
                :max="maxNumCores"
                v-model:value="numCores"
            />

            <!-- Shared Home Folder -->
            <ConfigCard
                icon="fluent:folder-link-32-filled"
                title="Shared Home Folder"
                type="switch"
                v-model:value="shareHomeFolder"
            >
                <template v-slot:desc>
                    If enabled, you will be able to access your Linux home folder within Windows under
                    <span class="font-mono bg-neutral-700 rounded-md px-1 py-0.5">Network\host.lan</span>
                </template>
            </ConfigCard>

            <!-- Auto Start Container -->
            <ConfigCard
                icon="clarity:power-solid"
                title="Auto Start Container"
                desc="If enabled, the Windows container will automatically be started when the system boots up"
                type="switch"
                v-model:value="autoStartContainer"
            />

            <!-- FreeRDP Port -->
            <ConfigCard
                icon="lucide:ethernet-port"
                title="FreeRDP Port"
                desc="You can change what port FreeRDP uses to communicate with the VM"
                type="custom"
            >
                <x-input
                    class="max-w-16 text-right text-[1.1rem]"
                    :value="Number.isNaN(freerdpPort) ? '' : freerdpPort"
                    @input="
                        (e: any) => {
                            freerdpPort = Number(
                                /^\d+$/.exec(e.target.value)?.at(0) ||
                                    portMapper?.getShortPortMapping(GUEST_RDP_PORT)?.host,
                            );
                        }
                    "
                >
                    <x-label v-if="Number.isNaN(freerdpPort)">None</x-label>
                </x-input>
            </ConfigCard>
            <div class="flex flex-col">
                <p class="my-0 text-red-500" v-for="(error, k) of errors" :key="k">❗ {{ error }}</p>
            </div>
            <x-button
                :disabled="saveButtonDisabled || isUpdatingUSBPrerequisites"
                @click="saveCompose()"
                class="w-24"
            >
                <span v-if="!isApplyingChanges || isUpdatingUSBPrerequisites">Save</span>
                <x-throbber v-else class="w-10"></x-throbber>
            </x-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import ConfigCard from "../../components/ConfigCard.vue";
import { computed, onMounted, ref, watch, reactive, onUnmounted } from "vue";
import { computedAsync } from "@vueuse/core";
import { Winboat } from "../../lib/winboat";
import type { ComposeConfig } from "../../../types";
import { WinboatConfig } from "../../lib/config";
import { ComposePortMapper } from "../../utils/port";
import { GUEST_RDP_PORT, RESTART_NO, RESTART_ON_FAILURE } from "../../lib/constants";
import { getSpecs } from "../../lib/specs";
import { useRouter } from "vue-router";

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

// For handling the QMP port, as we can't rely on the winboat instance doing this for us.
// A great example is when the container is offline. In that case, winboat's portManager isn't instantiated.
let portMapper = ref<ComposePortMapper | null>(null);

// Singleton classes
const wbConfig = reactive(WinboatConfig.getInstance());
const winboat = Winboat.getInstance();

// For Resources
const isApplyingChanges = ref(false);
const resetQuestionCounter = ref(0);
const isResettingWinboat = ref(false);
const isUpdatingUSBPrerequisites = ref(false);

// Constants
const HOMEFOLDER_SHARE_STR = winboat.containerMgr!.defaultCompose.services.windows.volumes.find(v => v.startsWith("${HOME}"))!;
const USB_BUS_PATH = "/dev/bus/usb:/dev/bus/usb";
const QMP_ARGUMENT = "-qmp tcp:0.0.0.0:7149,server,wait=off"; // 7149 can remain hardcoded as it refers to a guest port

onMounted(async () => {
    await assignValues();
});

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
    } 
    else if (!shareHomeFolder.value && composeHasHomefolderShare) {
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

</script>

<style scoped>
.opening-transition {
    transition: width 200ms, scale 200ms;
    @starting-style {
        width: 40%;
    }
}
</style>