import ChildProcess from "child_process";
import Chalk from "chalk";
import Path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = Path.dirname(fileURLToPath(import.meta.url));
const tscPath = Path.resolve(scriptDirectory, "..", "..", "node_modules", ".bin", "tsc");

export default function compile(directory: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const tscProcess = ChildProcess.spawn(tscPath, [], {
            cwd: directory,
            stdio: ["ignore", "pipe", "pipe"],
        });

        tscProcess.stdout.on("data", data =>
            process.stdout.write(Chalk.yellowBright(`[tsc] `) + Chalk.white(data.toString())),
        );
        tscProcess.stderr.on("data", data =>
            process.stderr.write(Chalk.redBright(`[tsc] `) + Chalk.white(data.toString())),
        );
        tscProcess.on("error", reject);

        tscProcess.on("exit", (exitCode, signal) => {
            if (exitCode !== 0) {
                reject(new Error(`TypeScript compiler failed with exitCode=${exitCode} signal=${signal}`));
            } else {
                resolve();
            }
        });
    });
}
