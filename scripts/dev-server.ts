process.env.NODE_ENV = "development";

import * as Vite from "vite";
import ChildProcess, { type ChildProcessWithoutNullStreams } from "child_process";
import Path from "path";
import Chalk from "chalk";
import Chokidar from "chokidar";
import Electron from "electron";
import FileSystem from "fs";
import { EOL } from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = Path.dirname(__filename);
const projectRoot = Path.join(__dirname, "..");

let viteServer: Vite.ViteDevServer | null = null;
let electronProcess: ChildProcessWithoutNullStreams | null = null;
let electronProcessLocker = false;
let rendererPort = 0;

async function startRenderer() {
    viteServer = await Vite.createServer({
        configFile: Path.join(__dirname, "..", "vite.config.ts"),
        mode: "development",
    });

    return viteServer.listen();
}

function compileMain() {
    return new Promise<void>((resolve, reject) => {
        const tscProcess = ChildProcess.spawn(process.execPath, ["run", "tsc", "-p", "src/main/tsconfig.json"], {
            cwd: projectRoot,
        });

        tscProcess.stdout.on("data", data =>
            process.stdout.write(Chalk.yellowBright(`[tsc] `) + Chalk.white(data.toString())),
        );

        tscProcess.stderr.on("data", data =>
            process.stderr.write(Chalk.yellowBright(`[tsc] `) + Chalk.white(data.toString())),
        );

        tscProcess.on("error", reject);

        tscProcess.on("close", (exitCode, signal) => {
            if (signal) {
                reject(new Error(`tsc was terminated by signal ${signal}`));
                return;
            }

            if ((exitCode ?? 1) > 0) {
                reject(new Error(`tsc exited with code ${exitCode ?? 1}`));
            } else {
                resolve();
            }
        });
    });
}

function formatError(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

async function startElectron() {
    if (electronProcess) {
        // single instance lock
        return;
    }

    try {
        await compileMain();
    } catch (error) {
        console.error(Chalk.redBright("Could not start Electron because of the above typescript error(s)."));
        console.error(Chalk.redBright(formatError(error)));
        electronProcessLocker = false;
        return;
    }

    const args = [Path.join(__dirname, "..", "build", "main", "main.js"), String(rendererPort)];

    electronProcess = ChildProcess.spawn(String(Electron), args);
    electronProcessLocker = false;

    electronProcess!.stdout.on("data", data => {
        if (data == EOL) {
            return;
        }

        process.stdout.write(Chalk.blueBright(`[electron] `) + Chalk.white(data.toString()));
    });

    electronProcess!.stderr.on("data", data =>
        process.stderr.write(Chalk.blueBright(`[electron] `) + Chalk.white(data.toString())),
    );

    electronProcess!.on("exit", () => stop());
}

function restartElectron() {
    if (electronProcess) {
        electronProcess.removeAllListeners("exit");
        electronProcess.kill();
        electronProcess = null;
    }

    if (!electronProcessLocker) {
        electronProcessLocker = true;
        startElectron();
    }
}

function copyStaticFiles() {
    copy("static");
}

/*
The working dir of Electron is build/main instead of src/main because of TS.
tsc does not copy static files, so copy them over manually for dev server.
*/
function copy(path) {
    FileSystem.cpSync(Path.join(projectRoot, "src", "main", path), Path.join(projectRoot, "build", "main", path), {
        recursive: true,
    });
}

function stop() {
    viteServer!.close();
    process.exit();
}

async function start() {
    console.log(`${Chalk.greenBright("=======================================")}`);
    console.log(`${Chalk.greenBright("Starting Electron + Vite Dev Server...")}`);
    console.log(`${Chalk.greenBright("=======================================")}`);

    const devServer = await startRenderer();
    rendererPort = devServer.config.server.port;

    copyStaticFiles();
    startElectron();

    const path = Path.join(projectRoot, "src", "main");
    Chokidar.watch(path, {
        cwd: path,
    }).on("change", path => {
        console.log(Chalk.blueBright(`[electron] `) + `Change in ${path}. reloading... 🚀`);

        if (path.startsWith(Path.join("static", "/"))) {
            copy(path);
        }

        restartElectron();
    });
}

start();
