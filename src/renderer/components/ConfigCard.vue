<template>
    <x-card
        class="flex flex-row justify-between items-center p-2 py-3 my-0 w-full backdrop-blur-xl backdrop-brightness-150 bg-neutral-800/20"
    >
        <div>
            <div class="flex flex-row gap-2 items-center mb-2">
                <Icon class="inline-flex text-violet-400 size-8" :icon="props.icon"></Icon>
                <h1 class="my-0 text-lg font-semibold">{{ props.title }}</h1>
            </div>
            <p class="text-neutral-400 text-[0.9rem] !pt-0 !mt-0">
                <slot name="desc">{{ props.desc }}</slot>
            </p>
        </div>
        <div class="flex flex-row gap-2 justify-center items-center">
            <slot v-if="props.type === 'custom'"/>
            <template v-else-if="props.type === 'number'">
                <x-button
                    v-if="props.step"
                    type="button"
                    class="size-8 !p-0"
                    @click="() => applyStep(-props.step!)"
                >
                    <Icon icon="mdi:minus" class="size-4"></Icon>
                    <x-label class="sr-only">Subtract</x-label>
                </x-button>
                <x-input
                    class="max-w-16 text-right text-[1.1rem]"
                    :min="props.min"
                    :max="props.max"
                    :value="value"
                    v-on:keydown="(e: any) => ensureNumericInput(e)"
                    @input="(e: any) => (value = Number(/^\d+$/.exec(e.target.value)![0] || props.min))"
                    required
                />
                <x-button
                    v-if="props.step"
                    type="button"
                    class="size-8 !p-0"
                    @click="() => applyStep(props.step!)"
                >
                    <Icon icon="mdi:plus" class="size-4"></Icon>
                    <x-label class="sr-only">Add</x-label>
                </x-button>
                <p class="text-neutral-100">{{ props.unit }}</p>
            </template>
            <template v-else-if="props.type === 'dropdown'">
                <x-select
                    class="w-20"
                    @change="(e: any) => (value = e.detail.newValue)"
                >
                    <x-menu>
                        <x-menuitem v-for="(opt, key) in props.options" :value="opt" :key="key" :toggled="value === opt">
                            <x-label>{{ opt }}{{ props.unit ?? '' }}</x-label>
                        </x-menuitem>
                    </x-menu>
                </x-select>
            </template>
            <template v-else-if="props.type === 'switch'">
                <x-switch
                    :toggled="value"
                    @toggle="(_: any) => { $emit('toggle'); (value = !value) }"
                    size="large"
                />
            </template>
        </div>
    </x-card>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue";

type PropsType = {
    icon: string;
    title: string;
    desc?: string;
    type: "number" | "dropdown" | "switch" | "custom";
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    options?: any[];
};

const props = defineProps<PropsType>();
const value = defineModel("value");

function ensureNumericInput(e: any) {
    if (e.metaKey || e.ctrlKey || e.which <= 0 || e.which === 8 || e.key === "ArrowRight" || e.key === "ArrowLeft") {
        return;
    }

    if (!/\d/.test(e.key)) {
        e.preventDefault();
    }
}

function applyStep(step: number) {
    let tmp = Number.parseInt(value.value as string);

    if (Number.isNaN(tmp)) return;

    tmp += step;

    if(!props.min && !props.max) {
        value.value = tmp;
        return;
    }

    value.value = Math.min(Math.max(props.min ?? Number.MIN_SAFE_INTEGER, tmp), props.max ?? Number.MAX_SAFE_INTEGER);
}
</script>