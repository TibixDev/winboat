import { execFileAsync, execFileWithStdin, stringifyExecFile } from "../lib/exec-helper";

export class FreeRDPInstallation {
    file: string;
    defaultArgs: string[];

    constructor(file: string, defaultArgs: string[] = []) {
        this.file = file;
        this.defaultArgs = defaultArgs;
    }

    exec(args: string[]): Promise<{
        stdout: string;
        stderr: string;
    }> {
        return execFileAsync(this.file, this.defaultArgs.concat(args));
    }

    execWithStdin(
        args: string[],
        stdin: string,
    ): Promise<{
        stdout: string;
        stderr: string;
    }> {
        return execFileWithStdin(this.file, this.defaultArgs.concat(args), stdin);
    }

    stringifyExec(args: string[]): string {
        return stringifyExecFile(this.file, this.defaultArgs.concat(args));
    }
}

export function buildFreeRDPConnectionArgs(username: string, port: number): string[] {
    return [`/u:${username}`, "/from-stdin:force", "/v:127.0.0.1", `/port:${port}`];
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
