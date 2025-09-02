<template>
    <div class="flex flex-col items-center justify-center h-[calc(100vh-9rem)]">
        <img class="w-48" src="/img/winboat_logo.png">
        <h2 class="mb-0">WinBoat</h2>
        <p class="text-sm text-gray-500">Windows for 🐧 penguins</p>
        <p class="text-gray-400 !mt-4">WinBoat Beta v{{ appVer }} {{ isDev ? 'Dev' : 'Prod' }}</p>
        <div>

        </div>
        <p class="text-gray-400 !mt-16">
            WinBoat is
            <a @click="openAnchorLink" href="https://github.com/TibixDev/WinBoat">open-source software</a>
        </p>
        <p class="text-gray-400 !mt-0">Copyright (c) 2025 TibixDev</p>
        <p class="text-sm text-gray-500 text-center !mt-16 w-[40vw]">
            WinBoat is not affiliated with Microsoft Corporation, nor is it endorsed or sponsored by them. "Windows" is a registered trademark of Microsoft Corporation, and all associated assets (icons, logos, etc.) are the property of Microsoft.
        </p>
    </div>
</template>

<script setup lang="ts">
import { openAnchorLink } from '../utils/openLink';
const appVer = import.meta.env.VITE_APP_VERSION;
const isDev = import.meta.env.DEV;
</script>