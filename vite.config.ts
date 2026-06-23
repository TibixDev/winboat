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
            // Force jimp to its ESM entry. The browser bundle is a single minified blob with
            // commonjsGlobal shims that Rollup can't always statically analyze, causing
            // "Jimp is not exported by node_modules/jimp/dist/browser/index.js" errors on
            // some installs (notably npm vs bun resolutions). The ESM build has clean
            // named exports for Jimp/JimpMime and works in Electron's renderer.
            jimp: path.join(__dirname, "node_modules/jimp/dist/esm/index.js"),
        },
    },
});

export default config;
