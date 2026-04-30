import ChildProcess from "child_process";
import Chalk from "chalk";
import Path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = Path.dirname(__filename);
const tscBinary = Path.join(
    __dirname,
    "..",
    "..",
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsc.cmd" : "tsc",
);

export default function compile(directory: string) {
    return new Promise<void>((resolve, reject) => {
        const tscProcess = ChildProcess.spawn(tscBinary, {
            cwd: directory,
        });

        tscProcess.stdout!.on("data", data =>
            process.stdout.write(Chalk.yellowBright(`[tsc] `) + Chalk.white(data.toString())),
        );

        tscProcess.stderr!.on("data", data =>
            process.stderr.write(Chalk.yellowBright(`[tsc] `) + Chalk.white(data.toString())),
        );

        tscProcess.on("error", reject);

        tscProcess.on("exit", exitCode => {
            if ((exitCode ?? 1) > 0) {
                reject(exitCode);
            } else {
                resolve();
            }
        });
    });
}
