<template>
    <Transition name="fade">
        <div v-if="isVisible" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div
                class="flex flex-col items-center gap-6 p-8 rounded-2xl bg-neutral-900/90 border border-neutral-700 shadow-2xl min-w-[400px]"
            >
                <!-- Loading Spinner -->
                <x-throbber class="w-24 h-24"></x-throbber>

                <!-- Status Text -->
                <div class="flex flex-col items-center gap-2 text-center">
                    <h2 class="text-2xl font-semibold text-white">{{ statusTitle }}</h2>
                    <p class="text-neutral-400">{{ statusMessage }}</p>
                </div>

                <!-- Progress Steps -->
                <div class="flex flex-col gap-3 w-full">
                    <div
                        v-for="step in steps"
                        :key="step.id"
                        class="flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-300"
                        :class="{
                            'bg-blue-500/20 text-blue-400': step.status === 'active',
                            'bg-green-500/20 text-green-400': step.status === 'completed',
                            'bg-neutral-800/50 text-neutral-500': step.status === 'pending',
                        }"
                    >
                        <!-- Step Icon -->
                        <div class="flex-shrink-0">
                            <Icon v-if="step.status === 'completed'" icon="mdi:check-circle" class="w-5 h-5" />
                            <Icon
                                v-else-if="step.status === 'active'"
                                icon="mdi:loading"
                                class="w-5 h-5 animate-spin"
                            />
                            <Icon v-else icon="mdi:circle-outline" class="w-5 h-5" />
                        </div>

                        <!-- Step Text -->
                        <span class="text-sm font-medium">{{ step.label }}</span>
                    </div>
                </div>

                <!-- Cancel Button (optional) -->
                <x-button v-if="showCancelButton" @click="$emit('cancel')" class="mt-2">
                    <x-label>Cancel</x-label>
                </x-button>
            </div>
        </div>
    </Transition>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";

export interface LoadingStep {
    id: string;
    label: string;
    status: "pending" | "active" | "completed";
}

const props = defineProps<{
    isVisible: boolean;
    appName?: string;
    currentStep?: "starting-container" | "waiting-online" | "launching-app" | "completed";
    showCancelButton?: boolean;
}>();

defineEmits<{
    cancel: [];
}>();

const statusTitle = computed(() => {
    switch (props.currentStep) {
        case "starting-container":
            return "Starting Container...";
        case "waiting-online":
            return "Waiting for Container...";
        case "launching-app":
            return `Launching ${props.appName || "Application"}...`;
        case "completed":
            return "Ready!";
        default:
            return "Loading...";
    }
});

const statusMessage = computed(() => {
    switch (props.currentStep) {
        case "starting-container":
            return "Starting the WinBoat container, this may take a moment.";
        case "waiting-online":
            return "Waiting for the container to be fully ready...";
        case "launching-app":
            return "Opening RDP window, please wait...";
        case "completed":
            return "Application launched successfully!";
        default:
            return "Please wait...";
    }
});

const steps = computed<LoadingStep[]>(() => {
    const currentStep = props.currentStep || "starting-container";

    const stepOrder = ["starting-container", "waiting-online", "launching-app"];
    const currentIndex = stepOrder.indexOf(currentStep);

    return [
        {
            id: "starting-container",
            label: "Start Container",
            status: currentIndex > 0 ? "completed" : currentIndex === 0 ? "active" : "pending",
        },
        {
            id: "waiting-online",
            label: "Wait for Container",
            status: currentIndex > 1 ? "completed" : currentIndex === 1 ? "active" : "pending",
        },
        {
            id: "launching-app",
            label: `Launch ${props.appName || "App"}`,
            status: currentIndex > 2 ? "completed" : currentIndex === 2 ? "active" : "pending",
        },
    ];
});
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

/* Pulse animation for active steps */
@keyframes pulse {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.5;
    }
}
</style>
