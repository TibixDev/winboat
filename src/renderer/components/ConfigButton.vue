<template>
    <div class="m-auto group 2xl:w-full 2xl: px-20 transition-all duration-500 ease-in-out">
        <x-card
            class="flex relative 2xl:flex-row flex-col 2xl:justify-between justify-center items-center gap-4 xl:w-72 2xl:w-full my-0 backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20"
        >
            <div class="flex flex-col 2xl:flex-row items-center gap-4">
                <FancyIcon 
                    class="inline-flex text-violet-400 stroke-2 size-28 2xl:size-20 flex-shrink-0 transition-all duration-500 ease-in-out 2xl:rotate-[360deg]" 
                    :icon="props.icon"
                />
                <div class="flex flex-col 2xl:items-start items-center gap-1">
                    <h3 class="text-4xl 2xl:text-2xl font-medium 2xl:font-normal text-white m-0 truncate">
                        {{ props.title }}
                    </h3>
                    <p class="text-neutral-400 text-normal m-0 leading-tight">
                        <slot name="desc">{{ props.desc }}</slot>
                    </p>
                </div>
            </div>
            <Icon 
                icon="mdi:chevron-right" 
                class="text-neutral-500 size-8 flex-shrink-0 hidden 2xl:inline-block"
            />
            <div class="absolute opacity-0 group-hover:opacity-100 inset-0 border-l-4 2xl:border-l-0 2xl:border-b-4 border-violet-400 scale-y-0 scale-x-100 2xl:scale-x-0 2xl:scale-y-100 group-hover:scale-y-100 2xl:group-hover:scale-x-100 rounded-sm 2xl:rounded-md transition-transform duration-300 ease-out"></div>
        </x-card>
    </div>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue";
import FancyIcon from "./FancyIcon.vue";

const props = defineProps<{
    icon: string;
    title: string;
    desc: string;
}>();
</script>