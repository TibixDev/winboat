interface ImportMetaEnv {
    readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare module "*.vue" {
    import type { Component } from "vue";

    const component: Component;
    export default component;
}
