<template>
    <div>
        <dialog ref="addCustomAppDialog">
            <h3 class="mb-2">Add Custom App</h3>
            <p>Add a custom app to your apps list.</p>

            <div class="flex flex-row gap-5 mt-4 w-[35vw]">
                <div class="flex flex-col items-center justify-center flex-none gap-2">
                    <div class="relative">
                        <img v-if="customAppIcon" :src="customAppIcon" class="size-24">
                        <Icon v-else class="size-24 text-neutral-400" icon="mdi:image"></Icon>
                        <button
                            @click="pickCustomAppIcon"
                            class="absolute top-0 left-0 flex flex-col items-center justify-center w-full h-full gap-1 transition duration-200 opacity-0 rounded-xl backdrop-blur-sm absoute bg-black/50 hover:opacity-100"
                        >
                            <Icon icon="mdi:pencil" class="size-10"></Icon>
                            <x-label>Change Icon</x-label>
                        </button>
                    </div>
                </div>
                <div class="flex flex-col gap-0.5 justify-center w-full">
                    <x-label>Name</x-label>
                    <x-input type="text" class="!max-w-full" @input="(e: any) => customAppName = e.target.value">
                        <x-label>My Awesome App</x-label>
                    </x-input>
                    <x-label class="mt-4">Path</x-label>
                    <x-input type="text" class="!max-w-full" @input="(e: any) => customAppPath = e.target.value">
                        <x-label>C:\Program Files\MyAwesomeApp\myapp.exe</x-label>
                    </x-input>
                </div>
            </div>

            <div class="flex flex-col gap-1 mt-2">
                <div class="flex flex-row items-center gap-2 my-0 font-semibold text-blue-400">
                    <Icon icon="fluent:info-32-filled" class="inline size-4"></Icon>
                    <p class="!my-0 break-normal max-w-[30vw]">
                        Please make sure the path you enter is a valid path to an executable file, otherwise the app will not work.
                    </p>
                </div>
                <div class="flex flex-row items-center gap-2 my-0 font-semibold text-blue-400">
                    <Icon icon="fluent:info-32-filled" class="inline size-4"></Icon>
                    <p class="!my-0 break-normal max-w-[30vw]">
                        Custom apps can be removed by right clicking on them and selecting "Remove Custom App".
                    </p>
                </div>
                <div class="flex flex-row items-center gap-2 my-0 font-semibold text-red-500" v-for="error, k of customAppAddErrors" :key="k">
                    <Icon icon="fluent:warning-32-filled" class="inline size-4"></Icon>
                    <p class="!my-0">{{ error }}</p>
                </div>
            </div>

            <footer>
                <x-button @click="cancelAddCustomApp" id="cancel-button">
                    <x-label>Cancel</x-label>
                </x-button>
                <x-button toggled id="add-button" :disabled="customAppAddErrors.length > 0" @click="addCustomApp">
                    <x-label>Add</x-label>
                </x-button>
            </footer>
        </dialog>
        
        <div
            class="flex items-center justify-between mb-6"
            :class="{
                'opacity-50 pointer-events-none':
                    winboat.containerStatus.value !== ContainerStatus.Running ||
                    !winboat.isOnline.value
            }"
        >
            <x-label class="text-neutral-300">Apps</x-label>
            <div class="flex flex-row items-center justify-center gap-2">
                <!-- Refresh button -->
                <x-button
                    class="flex flex-row items-center gap-1"
                    @click="refreshApps"
                >
                    <Icon icon="mdi:refresh" class="size-4"></Icon>
                    <x-label>Refresh</x-label>
                </x-button>

                <!-- Custom App Add Button -->
                <x-button
                    class="flex flex-row items-center gap-1"
                    @click="addCustomAppDialog!.showModal()"
                >
                    <x-icon href="#add" class="qualifier"></x-icon>
                    <x-label class="qualifier">Add Custom</x-label>
                </x-button>
                <x-select 
                    @change="(e: any) => sortBy = e.detail.newValue"
                    :disabled="!winboat.isOnline.value"
                >
                    <x-menu class="">
                        <x-menuitem value="name" toggled>
                            <x-icon href="#sort" class="qualifier"></x-icon>
                            <x-label>
                                <span class="qualifier">
                                    Sort By:
                                </span>
                                Name</x-label>
                        </x-menuitem>
                        <x-menuitem value="usage">
                            <x-icon href="#sort" class="qualifier"></x-icon>
                            <x-label>
                                <span class="qualifier">
                                    Sort By:
                                </span>
                                Usage
                            </x-label>
                        </x-menuitem>
                    </x-menu>
                </x-select>


                <!-- Search Input -->
                <x-input
                    id="search-term"
                    class="w-64 m-0 max-w-64"
                    type="text"
                    maxlength="32"
                    :value="searchInput"
                    @input="(e: any) => searchInput = e.target.value"
                    :disabled="!winboat.isOnline.value"
                >
                    <x-icon href="#search"></x-icon>
                    <x-label>Search</x-label>
                </x-input>
            </div>
        </div>
        <div v-if="winboat.isOnline.value" class="px-2">
                <TransitionGroup v-if="apps.length" name="apps" tag="x-card" class="grid gap-4 bg-transparent border-none app-grid">
                    <x-card
                        v-for="app of computedApps" :key="app.Path"
                        class="relative flex flex-row items-center justify-between gap-2 p-2 my-0 cursor-pointer backdrop-blur-xl backdrop-brightness-150 generic-hover bg-neutral-800/20"
                        :class="{ 'bg-gradient-to-r from-yellow-600/20 bg-neutral-800/20': app.Source === 'custom' }"
                        @click="winboat.launchApp(app)"
                    >
                        <div class="flex flex-row items-center gap-2 w-[85%]">
                            <img class="rounded-md size-10" :src="`data:image/png;charset=utf-8;base64,${app.Icon}`"></img>
                            <x-label class="truncate text-ellipsis">{{ app.Name }}</x-label>
                        </div>
                        <Icon icon="cuida:caret-right-outline"></Icon>
                        <WBContextMenu>
                            <WBMenuItem v-if="!app.HasDesktopShortcut" @click="addDesktopShortcut(app)">
                                <Icon class="size-4" icon="mdi:desktop-mac"></Icon>
                                <x-label>Add Desktop Shortcut</x-label>
                            </WBMenuItem>
                            <WBMenuItem v-if="app.HasDesktopShortcut" @click="removeDesktopShortcut(app)">
                                <Icon class="size-4" icon="mdi:minus"></Icon>
                                <x-label>Remove Desktop Shortcut</x-label>
                            </WBMenuItem>
                            <WBMenuItem v-if="app.Source === 'custom'" @click="removeCustomApp(app)">
                                <Icon class="size-4" icon="mdi:trash-can"></Icon>
                                <x-label>Remove Custom App</x-label>
                            </WBMenuItem>
                        </WBContextMenu>
                    </x-card>
                </TransitionGroup>
            <div v-else class="flex items-center justify-center mt-40">
                <x-throbber class="w-16 h-16"></x-throbber>
            </div>
        </div>
        <div v-else class="px-2 mt-32">
            <div class="flex flex-col items-center justify-center gap-4">
                <Icon class="text-violet-400 size-32" icon="fluent-mdl2:plug-disconnected"></Icon>
                <h1
                    class="text-xl font-semibold w-[30vw] text-center leading-16"
                >
                    <span v-if="winboat.containerStatus.value === ContainerStatus.Exited || winboat.containerStatus.value === ContainerStatus.Dead">
                        The WinBoat Container is not running, please start it to view your apps list.
                    </span>
                    <span v-else>
                        The WinBoat Guest API is not running, please restart the container. If this problem persists, contact customer support.
                    </span>
                </h1>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref, watch, useTemplateRef } from 'vue';
import { ContainerStatus, Winboat } from '../lib/winboat';
import { type WinApp } from '../../types';
import WBContextMenu from '../components/WBContextMenu.vue';
import WBMenuItem from '../components/WBMenuItem.vue';
import { AppIcons, DEFAULT_ICON } from '../data/appicons';
import { WINBOAT_GUEST_API, RDP_PORT } from '../lib/constants';
import { debounce } from '../utils/debounce';
import { Jimp, JimpMime } from 'jimp';
const nodeFetch: typeof import('node-fetch').default = require('node-fetch');
const FormData: typeof import('form-data') = require('form-data');

const winboat = new Winboat();
const apps = ref<WinApp[]>([]);
const searchInput = ref('');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sortBy = ref('');
const addCustomAppDialog = useTemplateRef('addCustomAppDialog');
const customAppName = ref('');
const customAppPath = ref('');
const customAppIcon = ref(`data:image/png;base64,${AppIcons[DEFAULT_ICON]}`);

const computedApps = computed(() => {
    if (!searchInput.value) return apps.value.sort((a, b) => { 
        if(sortBy.value == 'usage' && a.Usage !== b.Usage) {
            return b.Usage! - a.Usage!;
        }
        return a.Name.localeCompare(b.Name)
    });
    return apps.value
        .filter(app => app.Name.toLowerCase().includes(searchInput.value.toLowerCase()))
        .sort((a, b) => a.Name.localeCompare(b.Name));
})

onMounted(async () => {
    await refreshApps();

    watch(winboat.isOnline, async (newVal, _) => {
        if (newVal) {
            await refreshApps();
            console.log("Apps list: ", apps.value);
        }
    })

    // Fetch icon for custom app path
    watch(customAppPath, async (newVal, oldVal) => {
        await debouncedFetchIcon(newVal, oldVal);
    })
})

async function refreshApps() {
    if (winboat.isOnline.value) {
        apps.value = await winboat.appMgr!.getApps();
        // Run in background, won't impact UX
        await winboat.appMgr!.updateAppCache();
        if(winboat.appMgr!.appCache.length !== apps.value.length) {
            apps.value = winboat!.appMgr!.appCache;
        }
    }
}

const debouncedFetchIcon = debounce(async (newVal: string, oldVal: string) => {            
    if (newVal !== oldVal && newVal !== '') {
        const formData = new FormData();
        formData.append('path', newVal);
        const iconRes = await nodeFetch(`${WINBOAT_GUEST_API}/get-icon`, {
            method: 'POST',
            body: formData as any
        });
        const icon = await iconRes.text();
        customAppIcon.value = `data:image/png;base64,${icon}`;
        console.log(`Custom app icon fetched for ${newVal}:`, customAppIcon.value);
    }
}, 500)

const customAppAddErrors = computed(() => {
    const errors: string[] = [];

    if (!customAppName.value) {
        errors.push("A valid name is required for your app");
    }

    if (apps.value.find((app) => app.Name === customAppName.value)) {
        errors.push("An app with this name already exists");
    }

    const appWithConflictingPath = apps.value.find((app) => app.Path === customAppPath.value);
    if (appWithConflictingPath) {
        errors.push(`An app (${appWithConflictingPath.Name}) with this path already exists`);
    }

    if (!customAppPath.value) {
        errors.push("A valid path is required for your app");
    }

    if (!customAppIcon.value) {
        errors.push("A valid icon is required for your app");
    }

    return errors;
})

/**
 * Triggers the file picker for the custom app icon, then processes the image selected
 */
function pickCustomAppIcon() {
    const filePicker = document.createElement('input');
    filePicker.type = 'file';
    filePicker.accept = 'image/*';
    filePicker.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if(!file) {
            console.log("No file selected");
        }
        const reader = new FileReader();
        reader.onload = async (e: any) => {
            const buf = e.target.result as ArrayBuffer;
            try {
                const image = await Jimp.read(Buffer.from(buf));
                image.resize({ w: 128, h: 128 });
                const pngBuffer = await image.getBuffer(JimpMime.png);
                customAppIcon.value = `data:image/png;base64,${pngBuffer.toString('base64')}`;
            } catch (error) {
                console.error('Image processing failed:', error);
            }
        }
        reader.readAsArrayBuffer(file);
    }
    filePicker.click();
}

/**
 * Cancels the add custom app dialog and resets the form
 */
function cancelAddCustomApp() {
    addCustomAppDialog.value!.close();
    resetCustomAppForm();
}

/**
 * Adds a custom app to WinBoat's application list
 */
async function addCustomApp() {
    const iconRaw = customAppIcon.value.split('data:image/png;base64,')[1];
    await winboat.appMgr!.addCustomApp(customAppName.value, customAppPath.value, iconRaw);
    apps.value = await winboat.appMgr!.getApps();
    addCustomAppDialog.value!.close();
    resetCustomAppForm();
}

/**
 * Removes a custom app from WinBoat's application list
 */
async function removeCustomApp(app: WinApp) {
    await winboat.appMgr!.removeCustomApp(app);
    apps.value = await winboat.appMgr!.getApps();
}

async function addDesktopShortcut(app: WinApp) {

    const execCmd = await winboat.buildLaunchCommand(app);

    const appName = app.Name.replace(/[^a-zA-Z0-9-_\.]/g, '_');
    const binDir = path.join(os.homedir(), '.local', 'bin');
    const iconDir = path.join(os.homedir(), '.local', 'share', 'icons');
    const desktopShortcutDir = path.join(os.homedir(), '.local', 'share', 'applications');

    const wrapperContent = `
    WINBOAT_API=${JSON.stringify(WINBOAT_GUEST_API)}
    RDP_PORT=${JSON.stringify(RDP_PORT)}

    start_container() {
        docker start WinBoat >/dev/null 2>&1 || true
    }

    wait_for_health() {
        for _ in $(seq 1 8); do
            if curl -fsS --max-time 2 "$WINBOAT_API/health" >/dev/null 2>&1; then
                return 0
            fi
            sleep 1
        done
        return 1
    }

    wait_for_rdp() {
        for _ in $(seq 1 120); do
            if curl -fsS --max-time 2 "$WINBOAT_API/rdp/status" 2>/dev/null | grep -q '"rdpConnected":true'; then
                return 0
            fi
            sleep 1
        done
        return 1
    }

    start_container
    wait_for_health || true
    wait_for_rdp || true

    exec sh -lc ${JSON.stringify(execCmd)} "$@"
    `;


    try {
        await fs.promises.mkdir(binDir, { recursive: true });
        await fs.promises.mkdir(iconDir, { recursive: true });
        await fs.promises.mkdir(desktopShortcutDir, { recursive: true });

        let iconPath = '';
        if (app.Icon) {
            iconPath = path.join(iconDir, `${appName}.png`);
            await fs.promises.writeFile(iconPath, Buffer.from(app.Icon, 'base64'));
        }

        const wrapperPath = path.join(binDir, appName);
        const wrapperTmp = wrapperPath + '.tmp';
        await fs.promises.writeFile(wrapperTmp, wrapperContent, { mode: 0o700 });
        await fs.promises.rename(wrapperTmp, wrapperPath);

        const shortcutPath = path.join(desktopShortcutDir, `${appName}.desktop`);
        const shortcutTmp = shortcutPath + '.tmp';
        const desktopFile = [
            '[Desktop Entry]',
            `Name=${app.Name}`,
            `Exec=${wrapperPath} %U`,
            iconPath ? `Icon=${iconPath}` : null,
            'Type=Application',
            'Terminal=false',
            'StartupNotify=false',
            'Categories=Utility;Application;'
        ].filter(Boolean).join('\n');
        await fs.promises.writeFile(shortcutTmp, desktopFile, { mode: 0o644 });
        await fs.promises.rename(shortcutTmp, shortcutPath);

        app.HasDesktopShortcut = true;
        winboat.appMgr?.setDesktopShortcut(app.Name, true);

    } catch (err) {
        console.error('Failed to create desktop shortcut:', err);
        throw err;
    }
}

async function removeDesktopShortcut(app: WinApp) {
    const appName = app.Name.replace(/[^a-zA-Z0-9-_\.]/g, '_');
    const binDir = path.join(os.homedir(), '.local', 'bin');
    const iconDir = path.join(os.homedir(), '.local', 'share', 'icons');
    const desktopShortcutDir = path.join(os.homedir(), '.local', 'share', 'applications');

    const wrapperPath = path.join(binDir, appName);
    const shortcutPath = path.join(desktopShortcutDir, `${appName}.desktop`);
    const iconPath = path.join(iconDir, `${appName}.png`);
    const logPath = path.join(os.homedir(), '.cache', 'winboat', `${appName}.log`);

    async function unlinkIfExists(p: string) {
        try {
            await fs.promises.unlink(p);
        } catch (err: any) {
            if (err && err.code === 'ENOENT') return;
            throw err;
        }
    }

    try {
        await Promise.all([
            unlinkIfExists(wrapperPath),
            unlinkIfExists(shortcutPath),
            unlinkIfExists(iconPath),
            unlinkIfExists(logPath),
        ]);
    } catch (err) {
        console.warn('Failed to fully remove desktop shortcut files:', err);
    }

    app.HasDesktopShortcut = false;
    winboat.appMgr?.setDesktopShortcut(app.Name, false);
}

/**
 * Resets the custom app form to its default values
 */
async function resetCustomAppForm() {
    // So there is no visual flicker while the dialog is closing
    setTimeout(() => {
        customAppName.value = '';
        customAppPath.value = '';
        customAppIcon.value = `data:image/png;base64,${AppIcons[DEFAULT_ICON]}`;
    
        // Because of course Vue reactivity fails here :(
        addCustomAppDialog.value?.querySelectorAll('x-input')?.forEach((input: any) => {
            input.value = '';
        });
    }, 100)
}
</script>

<style scoped>
.app-grid {
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}

x-menu .qualifier {
    display: none;
}

x-menu 

.apps-move, /* apply transition to moving elements */
.apps-enter-active,
.apps-leave-active {
  transition: all 0.5s ease;
}

.apps-enter-from,
.apps-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

/* ensure leaving items are taken out of layout flow so that moving
   animations can be calculated correctly. */
.apps-leave-active {
  position: absolute;
}
</style>