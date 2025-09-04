<template>
    <div>
        <div class="flex items-center justify-between mb-6">
            <x-label class="text-neutral-300">Apps</x-label>
            <div class="flex flex-row justify-center items-center gap-2">
                <x-select 
                    @change="(e: any) => sortBy = e.detail.newValue"
                    :disabled="!winboat.isOnline.value"
                >
                    <x-menu>
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
                <x-input
                    id="select-username"
                    class="w-64 max-w-64 m-0"
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
                <TransitionGroup v-if="apps.length" name="apps" tag="x-card" class="grid app-grid gap-4 bg-transparent border-none">
                    <x-card
                        v-for="app of computedApps" :key="app.Path"
                        class="cursor-pointer generic-hover p-2 my-0 flex flex-row gap-2 items-center justify-between bg-neutral-800/20 backdrop-brightness-150 backdrop-blur-xl"
                        @click="winboat.launchApp(app)"
                    >
                        <div class="flex flex-row items-center gap-2 w-[85%]">
                            <img class="size-10 rounded-md" :src="`data:image/jpeg;charset=utf-8;base64,${app.Icon}`"></img>
                            <x-label class="text-ellipsis truncate">{{ app.Name }}</x-label>
                        </div>
                        <Icon icon="cuida:caret-right-outline"></Icon>
                    </x-card>
                </TransitionGroup>
            <div v-else class="flex justify-center items-center mt-40">
                <x-throbber class="w-16 h-16"></x-throbber>
            </div>
        </div>
        <div v-else class="px-2 mt-32">
            <div class="flex flex-col gap-4 items-center justify-center">
                <Icon class="size-32 text-violet-400" icon="fluent-mdl2:plug-disconnected"></Icon>
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
import { computed, onMounted, ref, watch } from 'vue';
import { ContainerStatus, Winboat } from '../lib/winboat';
import { type WinApp } from '../../types';

const winboat = new Winboat();
const apps = ref<WinApp[]>([]);
const searchInput = ref('');
const sortBy = ref('');

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
    if (winboat.isOnline.value) {
        apps.value = await winboat.appMgr!.getApps();

        // Run in background, won't impact UX
        await winboat.appMgr!.updateAppCache();
        if(winboat.appMgr!.appCache.length > apps.value.length) {
            apps.value = winboat!.appMgr!.appCache;
        }
    }

    watch(winboat.isOnline, async (newVal, _) => {
        if (newVal) {
            apps.value = await winboat.appMgr!.getApps();
            console.log("Apps list: ", apps.value);
        }
    })
})

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