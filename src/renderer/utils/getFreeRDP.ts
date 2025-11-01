import { execFileAsync, stringifyExecFile } from "../lib/exec-helper";

export type FreeRDPError = {
    cmd: string;
    code: number;
    killed: boolean;
    signal?: string | number;
    stderr: string;
    stdout: string;
    message: string;
    stack: string;
};

export class FreeRDPInstallation {
    file: string;
    defaultArgs: string[];

    constructor(file: string, defaultArgs?: string[]) {
        this.file = file;
        this.defaultArgs = defaultArgs || [];
    }

    exec(args: string[]): Promise<{
        stdout: string;
        stderr: string;
    }> {
        return execFileAsync(this.file, this.defaultArgs.concat(args));
    }

    stringifyExec(args: string[]): string {
        return stringifyExecFile(this.file, this.defaultArgs.concat(args));
    }
}

const freeRDPInstallations = [
    new FreeRDPInstallation("xfreerdp3"),
    new FreeRDPInstallation("xfreerdp"),
    new FreeRDPInstallation("flatpak", ["run", "--command=xfreerdp", "com.freerdp.FreeRDP"]),
];

/**
 * Returns the correct FreeRDP 3.x.x command available on the system or null
 */
export async function getFreeRDP() {
    const VERSION_3_STRING = "version 3.";
    for (let installation of freeRDPInstallations) {
        try {
            const shellOutput = await installation.exec(["--version"]);
            if (shellOutput.stdout.includes(VERSION_3_STRING)) {
                return installation;
            }
        } catch {}
    }
    return null;
}
