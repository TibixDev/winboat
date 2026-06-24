import path from "path";
import vuePlugin from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import * as packageJson from "./package.json";

// Node built-ins that may be reached via the renderer's dependency tree
// (notably pngjs/file-type via jimp). The renderer runs in Electron with
// nodeIntegration: true and contextIsolation: false, so these are available
// at runtime via Electron's Node integration. Marking them external prevents
// Vite from substituting empty browser shims (which surfaced at runtime as
// "util.inherits is not a function" when jimp's ESM build pulled in pngjs).
//
// We deliberately keep "path" off this list because the renderer aliases it
// to path-browserify (some renderer code uses Node-style path joining without
// pulling in Electron internals).
const NODE_BUILTINS_EXTERNAL = [
    "util",
    "node:util",
    "zlib",
    "node:zlib",
    "assert",
    "node:assert",
    "stream",
    "node:stream",
    "buffer",
    "node:buffer",
    "fs",
    "node:fs",
    "crypto",
    "node:crypto",
    "events",
    "node:events",
    "os",
    "node:os",
];

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
        rollupOptions: {
            external: NODE_BUILTINS_EXTERNAL,
            output: {
                // Keep Rollup from rewriting external `require("util")` etc. so
                // Electron's Node integration handles them at runtime.
                format: "es",
            },
        },
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
            // See note below on jimp ESM resolution.
            jimp: path.join(__dirname, "node_modules/jimp/dist/esm/index.js"),
        },
    },
    // Force jimp to its ESM entry. The browser bundle is a single minified blob
    // with commonjsGlobal shims that Rollup cannot reliably static-analyze on
    // every package-manager resolution, surfacing as "Jimp is not exported by
    // node_modules/jimp/dist/browser/index.js" on some installs (notably npm
    // resolutions differing from bun.lock). The ESM build has clean named
    // exports for Jimp/JimpMime.
    optimizeDeps: {
        include: ["jimp"],
    },
});

export default config;
