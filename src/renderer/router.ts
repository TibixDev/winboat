import { createMemoryHistory, createRouter, RouteRecordRaw } from "vue-router";

import Home from "./views/Home.vue";
import SetupUI from "./views/SetupUI.vue";
import Apps from "./views/Apps.vue";
import About from "./views/About.vue";
import Blank from "./views/Blank.vue";
import Config from "./views/Config.vue";
import Migration from "./views/Migration.vue";

import General from "./views/Config/General.vue";
import Winboat from "./views/Config/Winboat.vue";

export const routes: RouteRecordRaw[] = [
    { path: "/", component: Blank, meta: { icon: "line-md:loading-loop" } },
    { path: "/Home", component: Home, meta: { icon: "fluent:home-32-filled", nav: true } },
    { path: "/Migration", component: Migration, meta: { icon: "fluent:home-32-filled", } },
    { path: "/Setup", component: SetupUI, meta: { icon: "fluent-mdl2:install-to-drive", } },
    { path: "/Apps", component: Apps, meta: { icon: "fluent:apps-32-filled", nav: true } },
    { path: "/Configuration", component: Config, meta: { icon: "icon-park-outline:config", nav: true }, },
    { path: "/Configuration/WinBoat", component: Winboat, meta: { icon: "winboat:config-logo"} }, 
    { path: "/Configuration/General", component: General, meta: { icon: "icon-park-outline:config" } },
    { path: "/About", component: About, meta: { icon: "fluent:info-32-filled", nav: true } },
];

export type RouteToken = {
    token: string;
    icon?: string;
};

const iconLookup = Object.fromEntries(routes.map(route => {
    const lastSlashIdx = route.path.lastIndexOf("/");
    const lastToken = route.path.substring(lastSlashIdx + 1);
    return [lastToken, route.meta?.icon];
}));

export function splitRoute(url: string): RouteToken[] {
    return url.substring(1).split("/").map(token => ({ token, icon: iconLookup[token] as string | undefined }));
}

export function joinRouteTokens(tokens: RouteToken[]): string {
    return `/${tokens.map(x => x.token).join('/')}`;
}

export const router = createRouter({
    history: createMemoryHistory(),
    routes,
});
