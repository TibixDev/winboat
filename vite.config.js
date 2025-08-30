const Path = require('path');
const vuePlugin = require('@vitejs/plugin-vue');
const { defineConfig } = require('vite');
const packageJson = require('./package.json');

const config = defineConfig({
    root: Path.join(__dirname, 'src', 'renderer'),
    publicDir: 'public',
    server: {
        port: 8080,
    },
    define: {
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
    },
    open: false,
    build: {
        outDir: Path.join(__dirname, 'build', 'renderer'),
        emptyOutDir: true,
        rollupOptions: {
            external: ['fs', 'os', 'child_process', 'util'], // For build
        },
        chunkSizeWarningLimit: NaN
    },
    plugins: [
        vuePlugin({
            template: {
                compilerOptions: {
                    isCustomElement: (tag) => tag.startsWith('x-'),
                },
            },
        }),
    ],
    resolve: {
        alias: {
            path: 'path-browserify',
        },
    },
});

module.exports = config;