import path from "path";
import vuePlugin from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import * as packageJson from "./package.json";

const config = defineConfig({
    root: path.join(__dirname, "src", "renderer"),
    publicDir: "public",
    server: {
        port: 8080,
    },
    define: {
        "import.meta.env.VITE_APP_VERSION": JSON.stringify(packageJson.version),
        open: false,
    },
    build: {
        outDir: path.join(__dirname, "build", "renderer"),
        emptyOutDir: true,
        chunkSizeWarningLimit: NaN, // Not needed for a desktop app
    },
    plugins: [
        vuePlugin({
            template: {
                compilerOptions: {
                    isCustomElement: tag => tag.startsWith("x-"),
                },
            },
        }),
    ],
    resolve: {
        alias: {
            path: "path-browserify",
        },
    },
});

export default config;
