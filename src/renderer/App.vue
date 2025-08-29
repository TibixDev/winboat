<template>
    <main class="overflow-hidden relative w-screen h-screen">
        <!-- Decoration -->
        <div class="gradient-ball absolute -z-10 left-0 bottom-0 translate-x-[-50%] translate-y-[50%] w-[90vw] aspect-square opacity-15 blob-anim"></div>
        <div class="gradient-ball absolute -z-10 right-0 top-0 translate-x-[50%] translate-y-[-50%] w-[90vw] aspect-square opacity-15 blob-anim"></div>

        <!-- Titlebar -->
        <x-titlebar @minimize="handleMinimize()" @buttonclick="handleTitleBarEvent" class="backdrop-blur-xl bg-neutral-900/50">
            <x-label>WinBoat</x-label>
        </x-titlebar>

        <!-- Updater -->
        <dialog ref="updateDialog">
            <Icon class="text-indigo-400 size-12" icon="mdi:cloud-upload"></Icon>
            <h3 class="mt-2" v-if="winboat?.isUpdatingGuestServer.value">Updating Guest Server</h3>
            <h3 class="mt-2" v-else>Guest Server update successful!</h3>
            <p v-if="winboat?.isUpdatingGuestServer.value" class="max-w-[40vw]">
                The guest is currently running an outdated version of the WinBoat Guest Server. Please wait while we update it to the current version.
            </p>
            <p v-else class="max-w-[40vw]">
                The WinBoat Guest Server has been updated successfully! You can now close this dialog and continue using the application.
            </p>
            <footer>
                <x-progressbar v-if="winboat?.isUpdatingGuestServer.value" class="my-4"></x-progressbar>
                <x-button v-else id="close-button" @click="updateDialog!.close()" toggled>
                    <x-label>Close</x-label>
                </x-button>
            </footer>
        </dialog>

        <!-- UI / SetupUI -->
        <div v-if="useRoute().name !== 'SetupUI'" class="flex flex-row h-[calc(100vh-2rem)]">
            <x-nav class="flex flex-col flex-none gap-0.5 w-72 backdrop-blur-xl bg-gray-500/10 backdrop-contrast-90">
                <div
                    v-if="winboat?.rdpConnected.value"
                    class="w-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-blue-500 text-white
                    !mt-0 py-1 shadow-md shadow-indigo-500/50 transition-all duration-300 hover:brightness-105 flex flex-row items-center justify-center gap-2"
                >
                    <Icon class="size-5" icon="mdi:remote-desktop"></Icon>
                    <span class="font-semibold text-center">
                        RDP Session Active
                    </span>
                </div>
                <div class="flex flex-row gap-4 items-center p-4">
                    <img class="w-16 rounded-full"
                        src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Windows_10_Default_Profile_Picture.svg/2048px-Windows_10_Default_Profile_Picture.svg.png"
                        alt="Profile Picture">
                    <div>
                        <x-label class="text-lg font-semibold">{{ os.userInfo().username }}</x-label>
                        <x-label class="text-[0.8rem]">Local Account</x-label>
                    </div>
                </div>
                <RouterLink v-for="route of routes.filter(r => !['SetupUI', 'Loading'].includes(r.name))" :to="route.path" :key="route.path">
                    <x-navitem value="first">
                        <Icon class="mr-4 w-5 h-5" :icon="(route.meta!.icon as string)"></Icon>
                        <x-label>{{ route.name }}</x-label>
                    </x-navitem>
                </RouterLink>
                <div class="flex flex-col justify-end items-center p-4 h-full">
                    <p class="text-xs text-neutral-500">WinBoat Pre-Release Alpha {{ appVer }}</p>
                </div>
            </x-nav>
            <div class="px-5 flex-grow max-h-[calc(100vh-2rem)] overflow-y-auto py-4">
                <div class="flex flex-row gap-2 items-center my-6">
                    <Icon class="w-6 h-6 opacity-60" icon="icon-park-solid:toolkit"></Icon>
                    <h1 class="my-0 text-2xl font-semibold opacity-60">
                        WinBoat
                    </h1>
                    <Icon class="w-6 h-6" icon="bitcoin-icons:caret-right-filled"></Icon>
                    <Icon class="w-6 h-6" :icon="(useRoute().meta.icon as string)"></Icon>
                    <h1 class="my-0 text-2xl font-semibold">
                        {{ useRoute().name }}
                    </h1>
                </div>
                <router-view v-slot="{ Component }">
                    <transition mode="out-in" name="fade">
                        <component :is="Component" />
                    </transition>
                </router-view>
            </div>
        </div>

        <div v-else class="w-full h-[calc(100vh-2rem)]">
            <RouterView />
        </div>
    </main>
</template>

<script setup lang="ts">
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { routes } from './router';
import { Icon } from '@iconify/vue';
import { onMounted, useTemplateRef, watch } from 'vue';
import { isInstalled } from './lib/install';
import { Winboat } from './lib/winboat';
const { BrowserWindow }: typeof import('@electron/remote') = require('@electron/remote')
const os: typeof import('os') = require('os')
const path: typeof import('path') = require('path')
const remote: typeof import('@electron/remote') = require('@electron/remote');

const $router = useRouter();
const updateDialog = useTemplateRef('updateDialog');
const appVer = import.meta.env.VITE_APP_VERSION;
let winboat: Winboat | null = null;

onMounted(async () => {
    console.log("WinBoat app path:", path.join(remote.app.getAppPath(), "..", ".."));
    const winboatInstalled = await isInstalled();
    if (!winboatInstalled) {
        console.log("Not installed, redirecting to setup...")
        $router.push('/setup');
    } else {
        winboat = new Winboat();
        $router.push('/home');
    }

    // Watch for guest server updates and show dialog
    watch(() => winboat?.isUpdatingGuestServer.value, (newVal) => {
        if (newVal) {
            updateDialog.value!.showModal();
        } 
    })
})

function handleMinimize() {
    console.log("Minimize")
    window.electronAPI.minimizeWindow();
}

function handleTitleBarEvent(e: CustomEvent) {
    console.log("TitleBarEvt", e);
    switch (e.detail) {
        case "close":
            BrowserWindow.getFocusedWindow()!.close();
            break;
        case "maximize":
            if (BrowserWindow.getFocusedWindow()!.isMaximized()) {
                BrowserWindow.getFocusedWindow()!.unmaximize();
            } else {
                BrowserWindow.getFocusedWindow()!.maximize();
            }
            break;
        case "minimize":
            BrowserWindow.getFocusedWindow()!.minimize();
            break;
    }
}
</script>

<style>
dialog::backdrop {
    pointer-events: none;
    backdrop-filter: blur(8px);
}

.gradient-ball {
    border-radius: 99999px;
    background: linear-gradient(197.37deg, #7450DB -0.38%, rgba(138, 234, 240, 0) 101.89%), linear-gradient(115.93deg, #3E88F6 4.86%, rgba(62, 180, 246, 0.33) 38.05%, rgba(62, 235, 246, 0) 74.14%), radial-gradient(56.47% 76.87% at 6.92% 7.55%, rgba(62, 136, 246, 0.7) 0%, rgba(62, 158, 246, 0.182) 52.16%, rgba(62, 246, 246, 0) 100%), linear-gradient(306.53deg, #2EE4E3 19.83%, rgba(46, 228, 227, 0) 97.33%);
    background-blend-mode: normal, normal, normal, normal, normal, normal;
    filter: blur(200px);
}

@keyframes blob {
    from {
        filter: hue-rotate(0deg) blur(200px);
    }
    to {
        filter: hue-rotate(45deg) blur(200px);
    }
}

.blob-anim {
    animation: blob 5s linear infinite;
    animation-direction: alternate-reverse;
}

.fade-enter-active,
.fade-leave-active {
    transition: all 0.2s ease;
}

.fade-enter-from {
    opacity: 0;
    /* transform: translateX(20vw); */
}

.fade-leave-to {
    opacity: 0;
    /* transform: translateX(-20vw); */
}
</style>