import ChildProcess from "child_process";
import Chalk from "chalk";

export default function compile(directory) {
    return new Promise<void>((resolve, reject) => {
        const tscProcess = ChildProcess.exec("tsc", {
            cwd: directory,
        });

        tscProcess.stdout!.on("data", data =>
            process.stdout.write(Chalk.yellowBright(`[tsc] `) + Chalk.white(data.toString())),
        );

        tscProcess.on("exit", exitCode => {
            if (exitCode ?? 1 > 0) {
                reject(exitCode);
            } else {
                resolve();
            }
        });
    });
}
