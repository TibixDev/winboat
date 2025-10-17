<template>
    <div class="flex flex-col gap-4">
        <div class="flex justify-between items-center gap-4">
            <div class="flex-1 max-w-md">
                <input 
                    v-model="searchQuery"
                    type="text" 
                    placeholder="Search apps..." 
                    class="w-full px-3 py-2 bg-neutral-800/20 backdrop-blur-xl backdrop-brightness-150 border border-neutral-600/30 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
            </div>
            <x-select @change="(e: any) => selectedSource = e.detail.newValue">
                <x-menu>
                    <x-menuitem :value="Source.All" toggled>
                        <x-label>{{ Source.All }}</x-label>
                    </x-menuitem>
                    <x-menuitem :value="Source.Winget">
                        <x-label>{{ Source.Winget }}</x-label>
                    </x-menuitem>
                    <x-menuitem :value="Source.Scoop">
                        <x-label>{{ Source.Scoop }}</x-label>
                    </x-menuitem>
                    <x-menuitem :value="Source.Chocolatey">
                        <x-label>{{ Source.Chocolatey }}</x-label>
                    </x-menuitem>
                </x-menu>
            </x-select>
        </div>
        <x-card
            v-for="(app, index) in filteredApps"
            :key="index"
            class="flex flex-row justify-between items-center p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20">
            <div>
                <div class="flex flex-row gap-2 items-center mb-2">
                    <h1 class="my-0 text-lg font-semibold">{{ app.name }}</h1>
                    <span>{{ app.version }}</span>
                    <span class="text-neutral-500 text-sm">via {{ app.source }}</span>
                </div>
                <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">{{ app.description }}</p>
            </div>
            <div>
                <x-button class="py-2 px-4">Install</x-button>
            </div>
        </x-card>
    </div>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';

enum Source {
    All = 'All Sources',
    Winget = 'Winget',
    Scoop = 'Scoop',
    Chocolatey = 'Chocolatey',
}

type App = {
    name: string;
    version: string;
    source: Source;
    description: string;
}

const selectedSource = ref(Source.All);
const searchQuery = ref('');

const apps: App[] = [
    {
        name: "App 1",
        version: "v1.9.0",
        source: Source.Scoop,
        description: "Lorem ipsum dolor, sit amet consectetur adipisicing elit. Incidunt magnam laborum nulla, saepe expedita magni.",
    },
    {
        name: "Another App",
        version: "v10.4.2",
        source: Source.Chocolatey,
        description: "Lorem ipsum dolor, sit amet consectetur adipisicing elit. Incidunt magnam laborum nulla, saepe expedita magni.",
    },
    {
        name: "Program",
        version: "v1.3.9",
        source: Source.Winget,
        description: "Lorem ipsum dolor, sit amet consectetur adipisicing elit. Incidunt magnam laborum nulla, saepe expedita magni.",
    },
];

const filteredApps = computed(() => {
    let filtered = apps;
    
    // Filter by source
    if (selectedSource.value !== Source.All) {
        filtered = filtered.filter(app => app.source === selectedSource.value);
    }
    
    // Filter by search query
    if (searchQuery.value.trim()) {
        const query = searchQuery.value.toLowerCase().trim();
        filtered = filtered.filter(app => 
            app.name.toLowerCase().includes(query) ||
            app.description.toLowerCase().includes(query)
        );
    }
    
    return filtered;
});
</script>
