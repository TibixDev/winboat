<template>
    <div class="grid grid-cols-1 max-md:grid-rows-4 md:max-xl:grid-cols-2 max-xl:grid-rows-2 max-xl:flex-auto xl:mt-12 gap-2 max-h-[85%] centered">
        <ConfigButton
            v-for="(tokens, key) in routes.filter(x => x.path.startsWith('/Configuration/'))!.map(x => splitRoute(x.path))"
            
            :icon="tokens.at(-1)!.icon!"
            :title="tokens.at(-1)!.token"
            :key="key"
            desc="lorem ipsum"

            @click="router.push(joinRouteTokens(tokens))"
        />
    </div>
</template>

<script setup lang="ts">
import ConfigButton from "../components/ConfigButton.vue";
import { useRouter } from "vue-router";
import { joinRouteTokens, routes, splitRoute } from "../router";
const router = useRouter();
const navWidth = document.querySelector("[role='navigation']")?.clientWidth ?? 288;
</script>

<style>
@media (min-width: 1280px) {
    .centered {
        --offset: calc(v-bind(navWidth) * 1px);
        position: fixed;
        top: 50%;
        left: var(--offset);
        transform: translateY(-50%);
        width: calc(100vw - var(--offset));
    }
}

.devices-move,
.devices-enter-active,
.devices-leave-active,
.menu-move,
.menu-enter-active,
.menu-leave-active {
    transition: all 0.5s ease;
}

.devices-enter-from,
.devices-leave-to {
    opacity: 0;
    transform: translateX(30px);
}

.devices-leave-active,
.menu-leave-active {
    position: absolute;
}

.menu-enter-from,
.menu-leave-to {
    opacity: 0;
    transform: translateX(20px) scale(0.9);
}
</style>