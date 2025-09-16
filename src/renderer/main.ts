import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import { MotionPlugin } from '@vueuse/motion'   
import './index.css'
import { autoScroll } from "./directives/autoscroll";
import VueApexCharts from 'vue3-apexcharts'


createApp(App)
    .directive('auto-scroll', autoScroll)
    .use(router)
    .use(MotionPlugin)
    .use(VueApexCharts)
    .mount("#app");