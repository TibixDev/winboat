import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import { MotionPlugin } from "@vueuse/motion";
import i18n from "./i18n";
import "./index.css";
import { autoScroll } from "./directives/autoscroll";
import VueApexCharts from "vue3-apexcharts";

createApp(App)
    .directive("auto-scroll", autoScroll)
    .use(router)
    .use(i18n)
    .use(MotionPlugin)
    .use(VueApexCharts as any) // TODO: See https://github.com/apexcharts/vue3-apexcharts/issues/141
    .mount("#app");
