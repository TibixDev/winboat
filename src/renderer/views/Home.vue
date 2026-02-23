<template>
    <div>
        <x-card
            class="bg-neutral-800/20 backdrop-brightness-150 backdrop-blur-xl flex flex-row items-center justify-between"
        >
            <div class="flex flex-row gap-4 items-center">
                <div class="border-[0.4rem] border-gray-900/30 rounded-md p-6 bg-neutral-900/50">
                    <Icon class="size-20 text-blue-400" icon="mdi:dos"></Icon>
                </div>

                <!-- Status Text -->
                <div>
                    <div class="flex flex-row gap-2 items-center justify-center mb-6 *:m-0">
                        <h1 class="text-3xl">
                            {{ FREEDOS_VERSIONS[compose?.services.freedos.environment.VERSION ?? "1.3"] ?? "Unknown" }}
                        </h1>
                        <p class="bg-purple-500 px-4 rounded-full text-lg font-semibold !m-0">
                            {{ capitalizeFirstLetter(winboat.containerMgr!.executableAlias) }}
                        </p>
                    </div>

                    <div
                        class="flex flex-row items-center gap-1.5"
                        :class="{
                            'text-green-500': winboat.containerStatus.value === ContainerStatus.RUNNING,
                            'text-red-500': winboat.containerStatus.value === ContainerStatus.EXITED,
                            'text-yellow-500': winboat.containerStatus.value === ContainerStatus.PAUSED,
                            'text-orange-500': winboat.containerStatus.value === ContainerStatus.UNKNOWN,
                            'text-gray-500': winboat.containerStatus.value === ContainerStatus.CREATED,
                        }"
                    >
                        <Icon class="size-7 scale-90" icon="octicon:container-16"></Icon>
                        <p class="!my-0 font-semibold text-lg">
                            Container - {{ capitalizeFirstLetter(winboat.containerStatus.value) }}
                        </p>
                    </div>
                </div>
            </div>

            <!-- Buttons -->
            <div v-if="!winboat.containerActionLoading.value" class="flex flex-row items-center gap-5 text-gray-200/80">
                <button
                    title="View Desktop"
                    class="generic-hover"
                    v-if="winboat.containerStatus.value === ContainerStatus.RUNNING"
                    @click="winboat.launchVNC()"
                >
                    <Icon class="w-20 h-20 text-blue-300" icon="mdi:monitor"></Icon>
                </button>
                <button
                    title="Start"
                    class="generic-hover"
                    v-if="
                        winboat.containerStatus.value === ContainerStatus.EXITED ||
                        winboat.containerStatus.value === ContainerStatus.CREATED ||
                        winboat.containerStatus.value === ContainerStatus.UNKNOWN
                    "
                    @click="handleStartContainer"
                >
                    <Icon class="w-20 h-20 text-green-300" icon="mingcute:play-fill"></Icon>
                </button>
                <button
                    title="Stop"
                    class="generic-hover"
                    v-if="winboat.containerStatus.value === ContainerStatus.RUNNING"
                    @click="winboat.stopContainer()"
                >
                    <Icon class="w-20 h-20 text-red-300" icon="mingcute:stop-fill"></Icon>
                </button>
                <button
                    title="Restart"
                    class="generic-hover"
                    v-if="winboat.containerStatus.value === ContainerStatus.RUNNING"
                    @click="winboat.restartContainer()"
                >
                    <Icon class="w-20 h-20 text-orange-300" icon="mingcute:refresh-3-line"></Icon>
                </button>

                <button
                    title="Pause / Unpause"
                    class="generic-hover"
                    v-if="
                        winboat.containerStatus.value === ContainerStatus.RUNNING ||
                        winboat.containerStatus.value === ContainerStatus.PAUSED
                    "
                    @click="
                        winboat.containerStatus.value === ContainerStatus.PAUSED
                            ? winboat.unpauseContainer()
                            : winboat.pauseContainer()
                    "
                >
                    <Icon class="w-20 h-20 text-yellow-100" icon="mingcute:pause-line"></Icon>
                </button>
            </div>

            <div v-else>
                <x-throbber class="w-16 h-16"></x-throbber>
            </div>
        </x-card>

        <!-- Metrics -->
        <div class="grid grid-cols-3 w-full gap-8 transition-all duration-200">
            <x-card class="bg-neutral-800/20 backdrop-brightness-150 backdrop-blur-xl flex flex-row gap-2 pl-0 my-0">
                <apexchart
                    class="translate-y-2"
                    type="radialBar"
                    :options="chartOptions"
                    :series="[winboat.metrics.value.cpu.usage]"
                    :width="120"
                    :height="120"
                />
                <div>
                    <div class="flex flex-row gap-2 items-center mb-2">
                        <Icon class="size-8 text-violet-400" icon="solar:cpu-bold"></Icon>
                        <h2 class="my-0 text-2xl">CPU</h2>
                    </div>
                    <p class="!my-0 text-gray-400 h-6 overflow-hidden">
                        {{ compose?.services.freedos.environment.CPU_CORES }} Virtual Cores
                    </p>
                    <p class="!my-0 text-gray-400 h-6 overflow-hidden">
                        Frequency: {{ (winboat.metrics.value.cpu.frequency / 1000).toFixed(2) }} GHz
                    </p>
                </div>
            </x-card>
            <x-card class="bg-neutral-800/20 backdrop-brightness-150 backdrop-blur-xl flex flex-row gap-2 pl-0 my-0">
                <apexchart
                    class="translate-y-2"
                    type="radialBar"
                    :options="chartOptions"
                    :series="[winboat.metrics.value.ram.percentage]"
                    :width="120"
                    :height="120"
                />
                <div>
                    <div class="flex flex-row gap-2 items-center mb-2">
                        <Icon class="size-8 text-violet-400" icon="game-icons:ram"></Icon>
                        <h2 class="my-0 text-2xl">RAM</h2>
                    </div>
                    <p class="!my-0 text-gray-400 h-6 overflow-hidden">{{ allocatedRAM }} Allocated</p>
                    <p class="!my-0 text-gray-400 h-6 overflow-hidden">
                        {{ (winboat.metrics.value.ram.used / 1024).toFixed(2) }} GB Used RAM
                    </p>
                </div>
            </x-card>
            <x-card class="bg-neutral-800/20 backdrop-brightness-150 backdrop-blur-xl flex flex-row gap-2 pl-0 my-0">
                <apexchart
                    class="translate-y-2"
                    type="radialBar"
                    :options="chartOptions"
                    :series="[winboat.metrics.value.disk.percentage]"
                    :width="120"
                    :height="120"
                />
                <div>
                    <div class="flex flex-row gap-2 items-center mb-2">
                        <Icon class="size-8 text-violet-400" icon="carbon:vmdk-disk"></Icon>
                        <h2 class="my-0 text-2xl">Disk</h2>
                    </div>
                    <p class="!my-0 text-gray-400 h-6 overflow-hidden">
                        {{ (winboat.metrics.value.disk.total / 1024).toFixed(2) }} GB Total Disk Space
                    </p>
                    <p class="!my-0 text-gray-400 h-6 overflow-hidden">
                        {{ (winboat.metrics.value.disk.used / 1024).toFixed(2) }} GB Used Space
                    </p>
                    <p v-if="isVolumeStorage" class="!my-0 text-xs text-gray-500">
                        Disk usage not available for volume-backed storage.
                    </p>
                </div>
            </x-card>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { ContainerStatus } from "../lib/containers/common";
import { type ComposeConfig } from "../../types";
import { FREEDOS_VERSIONS, DOS_MEMORY_OPTIONS, SERIAL_PORT_PREFIXES } from "../lib/constants";
import { Icon } from "@iconify/vue";
import { capitalizeFirstLetter } from "../utils/capitalize";
import { SerialManager } from "../lib/serialmanager";
import { Dosboat } from "../lib/dosboat";

const electron: typeof import("electron") = require("electron").remote || require("@electron/remote");

const winboat = Dosboat.getInstance();
const serialManager = SerialManager.getInstance();
const compose = ref<ComposeConfig | null>(null);
const isVolumeStorage = ref(false);

/**
 * Parse RAM size string (e.g., "512M" or "1G") to MB
 */
function parseRAMToMB(ramSizeStr: string): number {
    if (!ramSizeStr) return 1024;

    const match = /^\s*([0-9.]+)\s*([KMG]?)(?:i?B)?\s*$/i.exec(ramSizeStr);
    if (!match) return 1024;

    const value = Number.parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    if (unit === "G") {
        return Math.round(value * 1024);
    } else if (unit === "K") {
        return Math.round(value / 1024);
    } else {
        return Math.round(value);
    }
}

/**
 * Get the memory option label for an MB value
 */
function getMBLabel(mb: number): string {
    // Find the exact match or closest option
    const validOptions = Object.entries(DOS_MEMORY_OPTIONS).sort(([, a], [, b]) => a - b);
    const matched = validOptions.find(([, optMB]) => Math.abs(optMB - mb) < 1);
    return matched ? matched[0] : `${(mb / 1024).toFixed(2)} GB`;
}

const allocatedRAM = computed(() => {
    if (!compose.value?.services.freedos.environment.RAM_SIZE) {
        return "1M";
    }
    const mb = parseRAMToMB(compose.value.services.freedos.environment.RAM_SIZE);
    return getMBLabel(mb);
});

onMounted(async () => {
    compose.value = Dosboat.readCompose(winboat.containerMgr!.composeFilePath);
    const storageVolume = compose.value.services.freedos.volumes.find(vol => vol.includes("/storage"));
    isVolumeStorage.value = !!storageVolume?.startsWith("data:");

    // Highlight the navitem for the home page, since by default no
    // navitem is highlighted and we can't use `toggled`
    document.querySelector<HTMLButtonElement>("x-navitem")?.click();
});

function stripSerialArgs(args: string): string {
    let cleaned = args;
    cleaned = cleaned.replace(/\s*-chardev\s+serial,id=hostserial\d+,path=\/dev\/tty\w+/g, "");
    cleaned = cleaned.replace(/\s*-device\s+isa-serial,chardev=hostserial\d+/g, "");
    return cleaned.trim();
}

async function applySerialPortsForStart(ports: string[]): Promise<void> {
    const nextCompose = Dosboat.readCompose(winboat.containerMgr!.composeFilePath);
    const portPrefixes = SERIAL_PORT_PREFIXES.map(prefix => `/dev/${prefix}`);

    nextCompose.services.freedos.devices = (nextCompose.services.freedos.devices ?? []).filter(
        device => !portPrefixes.some(prefix => device.includes(prefix)),
    );

    if (!nextCompose.services.freedos.environment.ARGUMENTS) {
        nextCompose.services.freedos.environment.ARGUMENTS = "";
    }

    nextCompose.services.freedos.environment.ARGUMENTS = stripSerialArgs(
        nextCompose.services.freedos.environment.ARGUMENTS,
    );

    if (ports.length > 0) {
        for (const mapping of serialManager.getDeviceMappingsFor(ports)) {
            if (!nextCompose.services.freedos.devices.includes(mapping)) {
                nextCompose.services.freedos.devices.push(mapping);
            }
        }

        const serialArgs = serialManager.generateQemuSerialArgsFor(ports);
        if (serialArgs) {
            nextCompose.services.freedos.environment.ARGUMENTS =
                `${nextCompose.services.freedos.environment.ARGUMENTS} ${serialArgs}`.trim();
        }
    }

    await winboat.replaceCompose(nextCompose);
}

async function handleStartContainer(): Promise<void> {
    let missingPorts = serialManager.getMissingPorts();

    while (missingPorts.length > 0) {
        const message =
            "One or more mapped serial devices were not detected and FreeDOS will not be able to use them:\n" +
            `${missingPorts.join("\n")}\n\n` +
            "Reconnect and click Retry, or start without them.";

        const { response } = await electron.dialog.showMessageBox({
            type: "warning",
            buttons: ["Start without", "Retry", "Cancel"],
            defaultId: 0,
            cancelId: 2,
            message,
        });

        if (response === 1) {
            missingPorts = serialManager.getMissingPorts();
            continue;
        }

        if (response === 2) {
            return;
        }

        const allowedPorts = serialManager.passedThroughPorts.value.filter(
            port => !missingPorts.includes(port),
        );
        await applySerialPortsForStart(allowedPorts);
        return;
    }

    await winboat.startContainer();
}

const chartOptions = ref({
    chart: {
        type: "radialBar",
        offsetY: -20,
        sparkline: {
            enabled: true,
        },
        width: 100,
        height: 100,
    },
    plotOptions: {
        radialBar: {
            startAngle: -135,
            endAngle: 135,
            track: {
                background: "#18181b", // Unfilled section color
                strokeWidth: "97%",
                margin: 5,
                // dropShadow: {
                //     enabled: true,
                //     top: 2,
                //     left: 0,
                //     color: '#444',
                //     opacity: 1,
                //     blur: 2
                // }
            },
            dataLabels: {
                name: {
                    show: false,
                },
                value: {
                    offsetY: 2,
                    fontSize: "12px",
                    color: "#FFFFFF",
                    formatter: function (val: number) {
                        return val.toFixed(1) + "%"; // Fixed to 1 decimal place
                    },
                },
            },
        },
    },
    grid: {
        padding: {
            top: -10,
        },
    },
    fill: {
        type: "solid", // Switched from gradient to solid
        colors: ["#A78AF9"], // Nice purple for the filled section
    },
    labels: ["Average Results"],
});
</script>
