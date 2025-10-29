import { ref } from "vue";

export type LaunchStep = "starting-container" | "waiting-online" | "launching-app" | "completed";

interface LaunchState {
    isLoading: boolean;
    appName: string | null;
    currentStep: LaunchStep | null;
}

const state = ref<LaunchState>({
    isLoading: false,
    appName: null,
    currentStep: null,
});

export function useShortcutLaunchState() {
    const startLaunch = (appName: string) => {
        state.value = {
            isLoading: true,
            appName,
            currentStep: "starting-container",
        };
    };

    const updateStep = (step: LaunchStep) => {
        if (state.value.isLoading) {
            state.value.currentStep = step;
        }
    };

    const completeLaunch = () => {
        state.value.currentStep = "completed";
        // Auto-hide after a short delay
        setTimeout(() => {
            state.value.isLoading = false;
        }, 1000);
    };

    const cancelLaunch = () => {
        state.value = {
            isLoading: false,
            appName: null,
            currentStep: null,
        };
    };

    return {
        state,
        startLaunch,
        updateStep,
        completeLaunch,
        cancelLaunch,
    };
}
