/// <reference types="node" />
import ChildProcess from "node:child_process";
import Chalk from "chalk";

export default function compile(directory: string) {
    return new Promise<void>((resolve, reject) => {
        const tscProcess = ChildProcess.exec("tsc", {
            cwd: directory,
        });

        tscProcess.stdout!.on("data", (data: Buffer) =>
            process.stdout.write(Chalk.yellowBright(`[tsc] `) + Chalk.white(data.toString())),
        );

        tscProcess.on("exit", (exitCode: number | null) => {
            if ((exitCode ?? 1) > 0) {
                reject(exitCode);
            } else {
                resolve();
            }
        });
    });
}
