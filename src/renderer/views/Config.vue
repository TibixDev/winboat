<template>
    <div class="grid grid-cols-3 2xl:grid-cols-1 2xl:mt-12 gap-2">
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

</script>

<style scoped>
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
