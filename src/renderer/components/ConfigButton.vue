<template>
    <div class="m-auto w-full max-h-full xl:px-20 transition-all duration-500 ease-in-out max-xl:aspect-square">
        <x-card
            class="flex relative max-xl:flex-col xl:justify-between justify-center items-center h-full my-0 backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20 group generic-hover"
            @click="router.push(props.nav)"
        >
            <div class="flex md:max-xl:flex-col h-full w-full items-center md:max-xl:justify-center gap-8">
                <FancyIcon 
                    class="inline-flex max-h-full md:max-xl:size-[40%] max-md:aspect-square text-violet-400 stroke-2 xl:size-20 flex-shrink-0 transition-all duration-500 ease-in-out xl:rotate-[360deg]" 
                    :icon="props.icon"
                />
                <div class="flex flex-col max-xl:items-center gap-1">
                    <h3 class="text-2xl font-medium text-white m-0 truncate">
                        {{ props.title }}
                    </h3>
                    <p class="text-neutral-400 text-normal m-0 leading-tight">
                        <slot name="desc">{{ props.desc }}</slot>
                    </p>
                </div>
            </div>
            <Icon 
                icon="mdi:chevron-right" 
                class="text-neutral-500 size-8 flex-shrink-0 hidden xl:inline-block"
            />
            <div class="absolute inset-0 max-xl:border-l-4 xl:border-b-4 border-violet-400 max-xl:scale-y-0 xl:scale-x-0 group-hover:scale-y-100 xl:group-hover:scale-x-100 rounded-sm xl:rounded-md transition-all duration-200 ease-out"></div>
        </x-card>
    </div>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue";
import FancyIcon from "./FancyIcon.vue";
import { useRouter } from "vue-router";

const props = defineProps<{
    icon: string;
    title: string;
    desc: string;
    nav: string;
}>();

const router = useRouter();
</script>