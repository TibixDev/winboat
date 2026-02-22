<template>
    <div class="flex flex-col items-center justify-center h-[calc(100vh-9rem)]">
        <img class="w-48" src="/img/dosboat.svg" alt="The DOSBoat Logo" />
        <!-- <h2 class="mb-0">DOSBoat</h2> -->
        <p class="text-sm text-gray-500">FreeDOS for 🐧 penguins</p>
        <p class="text-gray-400 !mt-4">DOSBoat Beta v{{ appVer }} {{ isDev ? "Dev" : "Prod" }}</p>
        <div></div>
        <p class="text-gray-400 !mt-16">
            DOSBoat is
            <a href="https://github.com/chevybowtie/dosboat" @click="openAnchorLink">open-source software</a>
        </p>
        <p class="text-gray-400 !mt-0">
            Forked from <a href="https://github.com/TibixDev/WinBoat" @click="openAnchorLink">WinBoat</a> by TibixDev
        </p>
        <p class="text-sm text-gray-500 text-center !mt-16 w-[40vw]">
            DOSBoat uses FreeDOS, which is free and open-source software. FreeDOS and DOS are not trademarks of any
            corporation. This project is provided as-is for legacy DOS application support.
        </p>
    </div>
</template>

<script setup lang="ts">
import { openAnchorLink } from "../utils/openLink";
const appVer = import.meta.env.VITE_APP_VERSION;
const isDev = import.meta.env.DEV;
</script>
