<template>
    <div class="flex justify-center items-center mt-40">
        <div v-if="useRoute().meta.migration" class="flex flex-col w-[40vw]">
            <div class="flex flex-row items-center gap-5">
                <h3 class="mt-2">Performing Migrations</h3>
                <x-throbber class="w-16 h-16"></x-throbber>
            </div>
            <p class="max-w-[40vw]">
                We need to update the container compose due to some changes introduced in 0.9.0     
            </p>
        </div>
        <x-throbber v-else class="w-16 h-16"></x-throbber>
    </div>
</template>

<script setup>
import { useRoute } from "vue-router";
</script>