<template>
    <div class="flex items-center justify-center relative h-full">
        <Icon class="size-[100%] text-violet-400/90 z-30 relative" :icon="props.icon" />
        <Icon
            class="size-[100%] text-violet-400/80 brightness-75 z-20 absolute top-[50%] translate-y-[-50%] blur-2xl"
            :icon="props.icon"
        />
        <Icon
            class="size-[100%] text-violet-400/60 brightness-75 z-20 absolute top-[51%] translate-y-[-50%] translate-x-[1.5%]"
            :icon="props.icon"
        />
        <Icon
            class="size-[100%] text-violet-400/40 brightness-50 z-10 absolute top-[52%] translate-y-[-50%] translate-x-[3%]"
            :icon="props.icon"
        />
    </div>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue";

const props = defineProps<{
    icon: string;
    yStep: number;
    xStep: number;
}>();
</script>