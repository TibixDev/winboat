<template>
    <div class="flex h-[calc(100vh-9rem)] flex-col items-center justify-center">
        <img class="w-48" src="/img/winboat_logo.svg" alt="The WinBoat Logo" />
        <h2 class="mb-0">WinBoat</h2>
        <p class="text-sm text-gray-500">Windows for 🐧 penguins</p>
        <p class="!mt-4 text-gray-400">WinBoat Beta v{{ appVer }} {{ isDev ? "Dev" : "Prod" }}</p>
        <div></div>
        <p class="!mt-16 text-gray-400">
            WinBoat is
            <a @click="openAnchorLink" href="https://github.com/TibixDev/WinBoat">open-source software</a>
        </p>
        <p class="!mt-0 text-gray-400">Copyright (c) 2026 TibixDev</p>
        <p class="!mt-16 w-[40vw] text-center text-sm text-gray-500">
            WinBoat is not affiliated with Microsoft Corporation, nor is it endorsed or sponsored by them. "Windows" is
            a registered trademark of Microsoft Corporation, and all associated assets (icons, logos, etc.) are the
            property of Microsoft.
        </p>
    </div>
</template>

<script setup lang="ts">
import { openAnchorLink } from "../utils/openLink";
const appVer = import.meta.env.VITE_APP_VERSION;
const isDev = import.meta.env.DEV;
</script>
