<template>
    <div class="flex items-center justify-center relative h-full *:h-min">
        <Icon class="size-[100%] text-violet-400/90 z-30 relative" :icon="icon" />
        <Icon
            class="size-[100%] text-violet-400/80 brightness-75 z-20 absolute top-[50%] translate-y-[-50%] blur-2xl"
            :icon="icon"
        />
        <Icon
            class="size-[100%] text-violet-400/60 brightness-75 z-20 absolute top-[calc(50%+var(--yStep))] translate-y-[-50%] translate-x-[var(--xStep)]"
            :icon="icon"
        />
        <Icon
            class="size-[100%] text-violet-400/40 brightness-50 z-10 absolute top-[calc(50%+var(--yStep)*2)] translate-y-[-50%] translate-x-[calc(var(--xStep)*2)]"
            :icon="icon"
        />
    </div>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue";

const { icon, yStep = 2, xStep = 2 } = defineProps<{
    icon: string;
    yStep?: number;
    xStep?: number;
}>();
</script>

<style scoped>
div {
    --xStep: calc(v-bind(xStep) * 1%);
    --yStep: calc(v-bind(yStep) * 1%);
}
</style>