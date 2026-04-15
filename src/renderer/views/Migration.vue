<template>
    <div class="flex flex-col gap-2 justify-center items-center mt-12">
        <div id="stepIcon" class="flex items-center justify-center relative size-[30rem]">
            <Icon key="icon1" class="size-[60%] text-violet-400 z-30 relative" :icon="currentIcon" />
            <Icon
                key="icon-gradient"
                class="size-[60%] text-violet-400 brightness-75 z-20 absolute top-[50%] translate-y-[-50%] blur-2xl"
                :icon="currentIcon"
            />
            <Icon
                key="icon2"
                class="size-[60%] text-violet-400 brightness-75 z-20 absolute top-[51.5%] translate-y-[-50%] translate-x-[1.5%]"
                :icon="currentIcon"
            />
            <Icon
                key="icon3"
                class="size-[60%] text-violet-400 brightness-50 z-10 absolute top-[53%] translate-y-[-50%] translate-x-[3%]"
                :icon="currentIcon"
            />
        </div>
        <h3 class="mt-2">
            Performing Migrations
            <div class="loader inline-block translate-y-1"></div>
        </h3>
        <p class="text-gray-400 max-w-[40vw] text-center">
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
