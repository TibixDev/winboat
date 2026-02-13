<template>
    <div class="flex flex-col mt-12">
        <div class="flex flex-col gap-4 opening-transition self-center max-w-full w-[84rem] ease-in">
            <ConfigCard
                icon="streamline-ultimate:lab-tube-experiment"
                title="Experimental Features"
                desc="If enabled, you'll have access to experimental features that may not be stable or complete"
                type="switch"
                v-model:value="wbConfig.config.experimentalFeatures"
                @toggle="toggleExperimentalFeatures"
            />

            <ConfigCard
                icon="mdi:administrator"
                title="Advanced Settings"
                desc="If enabled, you'll have access to advanced settings that may prevent WinBoat from working if misconfigured"
                type="switch"
                v-model:value="wbConfig.config.advancedFeatures"
            />

            <ConfigCard
                icon="mdi:animation-outline"
                title="Disable Animations"
                desc="If enabled, all animations in the UI will be disabled (useful when GPU acceleration isn't working well)"
                type="switch"
                v-model:value="wbConfig.config.disableAnimations"
            />

            <ConfigCard
                icon="fluent:remote-16-filled"
                title="RDP Monitoring"
                desc="If enabled, a banner will appear when the RDP session is connected (may cause high CPU usage, disable if you notice performance issues)"
                type="switch"
                v-model:value="wbConfig.config.rdpMonitoringEnabled"
            />
        </div>
    </div>
</template>


<script setup lang="ts">
import ConfigCard from "../../components/ConfigCard.vue";
import { ContainerStatus } from "../../lib/containers/container";
import { USBManager } from "../../lib/usbmanager";
import { WinboatConfig } from "../../lib/config";
import { Winboat } from "../../lib/winboat";
import { reactive } from "vue";

const wbConfig = reactive(WinboatConfig.getInstance());
const winboat = Winboat.getInstance();
const usbManager = USBManager.getInstance();

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