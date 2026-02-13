<template>
    <div class="flex flex-col mt-12">
        <div class="flex flex-col gap-4 opening-transition self-center max-w-full w-[84rem] ease-in">
            <ConfigCard
                class="relative z-10"
                icon="uil:scaling-right"
                title="Display Scaling"
                desc="Controls how large the display scaling is."
                type="dropdown"
                unit="%"
                :options="[Number(100), 140, 180]"
                v-model:value="wbConfig.config.scale"
            />

            <ConfigCard
                icon="uil:apps"
                title="Application Scaling"
                desc="Controls how large the application scaling is.."
                type="number"
                :step="10"
                :min="100"
                :max="500"
                v-model:value="wbConfig.config.scaleDesktop"
            />

            <ConfigCard
                class="relative z-10"
                icon="uil:monitor"
                title="Multi-Monitor Support"
                type="dropdown"
                :options="Object.values(MultiMonitorMode)"
                v-model:value="wbConfig.config.multiMonitor"
            >
                <template v-slot:desc>
                    Controls how multiple monitors are handled. MultiMon creates separate displays for each
                    monitor, while Span stretches the display across all monitors. Note: Span or MultiMon may
                    work better depending on your setup.
                </template>
            </ConfigCard>

            <x-card
                class="flex flex-col p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20 relative"
                :class="{ 'brightness-75 opacity-50 blur-sm pointer-events-none': !wbConfig.config.advancedFeatures }"
            >
                <div class="flex flex-row gap-2 items-center mb-2">
                    <Icon class="inline-flex text-violet-400 size-8" icon="fluent:tv-24-filled"></Icon>
                    <h1 class="my-0 text-lg font-semibold">
                        FreeRDP Arguments
                        <span class="bg-blue-500 rounded-full px-3 py-0.5 text-sm ml-2"> Advanced </span>
                    </h1>
                </div>

                <x-label
                    v-if="wbConfig.config.rdpArgs.length == 0"
                    class="text-neutral-400 text-[0.9rem] pt-0 mt-0"
                >
                    Press the buttons below to add arguments to FreeRDP, you can choose to either add a new
                    argument or modify an existing one to your liking via replacement
                </x-label>

                <TransitionGroup name="devices" tag="x-box" class="flex-col gap-2 mt-4">
                    <x-card
                        v-for="(arg, index) in wbConfig.config.rdpArgs"
                        class="flex items-center gap-2 px-2 py-0 m-0 bg-white/5"
                        :key="index"
                    >
                        <div class="grid grid-cols-2 gap-2 items-center w-full">
                            <x-input
                                v-if="arg.isReplacement"
                                type="text"
                                class="max-w-full input-animation"
                                :value="arg.original"
                                @input="(e: any) => (arg.original = e.target.value)"
                            >
                                <x-label>Original Argument</x-label>
                            </x-input>

                            <x-input
                                type="text"
                                class="max-w-full mt-0 input-animation"
                                :class="{ 'col-span-2': !arg.isReplacement }"
                                :value="arg.newArg"
                                @input="(e: any) => (arg.newArg = e.target.value)"
                            >
                                <x-label>New Argument</x-label>
                            </x-input>
                        </div>

                        <x-button
                            class="mt-1 bg-gradient-to-tl from-red-500/20 to-transparent hover:from-red-500/30 transition border-0"
                            @click="wbConfig.config.rdpArgs.splice(index, 1)"
                        >
                            <x-icon href="#remove"></x-icon>
                        </x-button>
                    </x-card>
                </TransitionGroup>

                <div class="flex flex-row gap-2" :class="{ 'mt-4': wbConfig.config.rdpArgs.length }">
                    <x-button
                        class="bg-gradient-to-tl from-blue-400/20 shadow-md shadow-blue-950/20 to-transparent hover:from-blue-400/30 transition"
                        @click="wbConfig.config.rdpArgs.push({ newArg: '', isReplacement: false })"
                    >
                        <x-icon href="#add"></x-icon>
                        <x-label>Add Argument</x-label>
                    </x-button>

                    <x-button
                        class="bg-gradient-to-tl from-yellow-400/20 shadow-md shadow-yellow-950/20 to-transparent hover:from-yellow-400/30 transition"
                        @click="wbConfig.config.rdpArgs.push({ newArg: '', original: '', isReplacement: true })"
                    >
                        <Icon class="inline-flex size-6" icon="codex:replace" />
                        <x-label>Replace Argument</x-label>
                    </x-button>
                </div>
            </x-card>
        </div>
    </div>
</template>


<script setup lang="ts">
import { Icon } from "@iconify/vue";
import ConfigCard from "../../components/ConfigCard.vue";
import { MultiMonitorMode, WinboatConfig } from "../../lib/config";
import { reactive } from "vue";

const wbConfig = reactive(WinboatConfig.getInstance());


</script>