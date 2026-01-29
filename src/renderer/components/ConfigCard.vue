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
                <x-input
                    class="max-w-16 text-right text-[1.1rem]"
                    :min="props.min"
                    :max="props.max"
                    :value="value"
                    @input="(e: any) => (value = Number(/^\d+$/.exec(e.target.value)![0] || 4))"
                    required
                />
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
                    @toggle="(_: any) => (value = !value)"
                    size="large"
                />
            </template>
        </div>
    </x-card>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue";

type BaseProps = { 
    icon: string;
    title: string;
    desc?: string;
};

// TODO: get rid of this, defineProps doesn't really support the original idea either way.
type PropsType = BaseProps & {
    type: "number";
    min?: number;
    max?: number;
    unit?: string
} | BaseProps & {
    type: "dropdown";
    options?: any[];
    unit?: string;
} | BaseProps & {
    type: "switch"
} | BaseProps & {
    type: "custom"
}; 

const props = defineProps<PropsType>();
const value = defineModel("value");
</script>