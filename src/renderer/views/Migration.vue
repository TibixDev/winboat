<template>
    <div class="mt-12 flex flex-col items-center justify-center gap-2">
        <div id="stepIcon" class="relative flex size-[30rem] items-center justify-center">
            <Icon key="icon1" class="relative z-30 size-[60%] text-violet-400" :icon="currentIcon" />
            <Icon
                key="icon-gradient"
                class="absolute top-[50%] z-20 size-[60%] translate-y-[-50%] text-violet-400 blur-2xl brightness-75"
                :icon="currentIcon"
            />
            <Icon
                key="icon2"
                class="absolute top-[51.5%] z-20 size-[60%] translate-x-[1.5%] translate-y-[-50%] text-violet-400 brightness-75"
                :icon="currentIcon"
            />
            <Icon
                key="icon3"
                class="absolute top-[53%] z-10 size-[60%] translate-x-[3%] translate-y-[-50%] text-violet-400 brightness-50"
                :icon="currentIcon"
            />
        </div>
        <h3 class="mt-2">
            Performing Migrations
            <div class="loader inline-block translate-y-1"></div>
        </h3>
        <p class="max-w-[40vw] text-center text-gray-400">
            Please wait while we migrate your existing WinBoat configuration to ensure compatibility with the latest
            version.
        </p>
    </div>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { ref } from "vue";

const currentIcon = ref("line-md:cloud-alt-print-loop");
</script>

<style scoped>
.loader {
    width: 30px;
    aspect-ratio: 2;
    --_g: no-repeat radial-gradient(circle closest-side, rgb(255, 255, 255) 90%, #0000);
    background:
        var(--_g) 0% 50%,
        var(--_g) 50% 50%,
        var(--_g) 100% 50%;
    background-size: calc(100% / 3) 50%;
    animation: l3 1s infinite linear;
}

@keyframes l3 {
    20% {
        background-position:
            0% 0%,
            50% 50%,
            100% 50%;
    }

    40% {
        background-position:
            0% 100%,
            50% 0%,
            100% 50%;
    }

    60% {
        background-position:
            0% 50%,
            50% 100%,
            100% 0%;
    }

    80% {
        background-position:
            0% 50%,
            50% 50%,
            100% 100%;
    }
}
</style>
