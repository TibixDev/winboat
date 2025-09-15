import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import { MotionPlugin } from '@vueuse/motion'   
import { addIcon, setCustomIconLoader } from '@iconify/vue';
import './index.css'
import { autoScroll } from "./directives/autoscroll";
import VueApexCharts from 'vue3-apexcharts'
addIcon("winboat:remote-desktop", {
    body: `<path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="12" d="M96 170c40.869 0 74-33.131 74-74 0-40.87-33.131-74-74-74-40.87 0-74 33.13-74 74 0 40.869 33.13 74 74 74Z"/><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="12" d="M126 52 98 80l28 28M66 84l28 28-28 28"/>`,
    width: 192,
    height: 192  
})
createApp(App)
    .directive('auto-scroll', autoScroll)
    .use(router)
    .use(MotionPlugin)
    .use(VueApexCharts)
    .mount("#app");