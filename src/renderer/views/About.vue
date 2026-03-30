<template>
    <div class="flex flex-col items-center justify-center h-[calc(100vh-9rem)]">
        <img class="w-48" src="/img/winboat_logo.svg" alt="The WinBoat Logo" />
        <h2 class="mb-0">WinBoat</h2>
        <p class="text-sm text-gray-500">Windows for 🐧 penguins</p>
        <p class="text-gray-400 !mt-4">WinBoat Beta v{{ appVer }} {{ isDev ? "Dev" : "Prod" }}</p>
        <p class="text-gray-400 !mt-16">
            WinBoat is
            <a @click="openAnchorLink" href="https://github.com/TibixDev/WinBoat">open-source software</a>
        </p>
        <p class="text-gray-400 !mt-0">Copyright (c) 2026 TibixDev</p>
        <p class="text-sm text-gray-500 text-center !mt-16 w-[40vw]">
            WinBoat is not affiliated with Microsoft Corporation, nor is it endorsed or sponsored by them. "Windows" is
            a registered trademark of Microsoft Corporation, and all associated assets (icons, logos, etc.) are the
            property of Microsoft.
        </p>
        <div class="flex flex-row gap-2 items-left">
            <a href="https://ko-fi.com/winboat" @click="openAnchorLink" title="Donate">
                <Icon class="w-8 h-8 text-neutral-500 hover:scale-110 active:scale-95 pointer-events-none" icon="simple-icons:kofi" />
            </a>
            <a href="https://fosstodon.org/@winboat" @click="openAnchorLink" title="Mastodon">
                <Icon class="w-8 h-8 text-neutral-500 hover:scale-110 active:scale-95 pointer-events-none" icon="simple-icons:mastodon" />
            </a>
            <a href="https://bsky.app/profile/winboat.app" @click="openAnchorLink" title="Bluesky">
                <Icon class="w-8 h-8 text-neutral-500 hover:scale-110 active:scale-95 pointer-events-none" icon="simple-icons:bluesky" />
            </a>
            <a href="https://x.com/winboat_app" @click="openAnchorLink" title="Twitter (X)">
                <Icon class="w-8 h-8 text-neutral-500 hover:scale-110 active:scale-95 pointer-events-none" icon="simple-icons:twitter" />
            </a>
            <a href="mailto:staff@winboat.app" @click="openAnchorLink" title="Email (staff@winboat.app)">
                <Icon class="w-8 h-8 text-neutral-500 hover:scale-110 active:scale-95 pointer-events-none" icon="simple-icons:maildotru" />
            </a>
        </div>
    </div>
</template>

<script setup lang="ts">
import { openAnchorLink } from "../utils/openLink";
import { Icon } from "@iconify/vue";
const appVer = import.meta.env.VITE_APP_VERSION;
const isDev = import.meta.env.DEV;
</script>
