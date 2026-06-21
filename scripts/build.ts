import ChildProcess from "child_process";
import Path from "path";
import Chalk from "chalk";
import FileSystem from "fs";
import compileTs from "./private/tsc.ts";
// ^ Extension can't be omitted because Node expects it
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = Path.dirname(__filename);
const repoRoot = Path.join(__dirname, "..");

/**
 * Run Vite under Node when available (avoids Bun + Vite 8+ resolution issues like missing vite/module-runner).
 * Fall back to programmatic build under Bun — keep vite pinned to 7.3.x in package.json for that path.
 */
async function buildRenderer(): Promise<void> {
    const viteJs = Path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
    const config = Path.join(repoRoot, "vite.config.ts");
    const args = [viteJs, "build", "--config", config, "--base", "./", "--mode", "production"];

    const nodeProbe = ChildProcess.spawnSync("node", ["-v"], { encoding: "utf8" });
    if (nodeProbe.status === 0) {
        const r = ChildProcess.spawnSync("node", args, {
            cwd: repoRoot,
            stdio: "inherit",
            encoding: "utf8",
        });
        if (r.status !== 0) {
            throw new Error("Vite build failed under Node");
        }
        return;
    }

    const Vite = await import("vite");
    await Vite.build({
        configFile: config,
        base: "./",
        mode: "production",
    });
}

function buildMain() {
    const mainPath = Path.join(__dirname, "..", "src", "main");
    return compileTs(mainPath);
}

FileSystem.rmSync(Path.join(__dirname, "..", "build"), {
    recursive: true,
    force: true,
});

console.log(Chalk.blueBright("Transpiling renderer & main..."));

Promise.allSettled([buildRenderer(), buildMain()]).then(() => {
    console.log(
        Chalk.greenBright("Renderer & main successfully transpiled! (ready to be built with electron-builder)"),
    );
});
