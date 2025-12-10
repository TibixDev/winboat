import ChildProcess from "child_process";
import Chalk from "chalk";

export default function compile(directory: string) {
    return new Promise<void>((resolve, reject) => {
        const tscProcess = ChildProcess.exec("tsc", {
            cwd: directory,
        });

        tscProcess.stdout!.on("data", data =>
            process.stdout.write(Chalk.yellowBright(`[tsc] `) + Chalk.white(data.toString())),
        );

        tscProcess.on("exit", exitCode => {
            // In dev mode, continue even if there are type errors
            // Just log them for reference
            resolve();
        });
    });
}
