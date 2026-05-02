import { execFileAsync, stringifyExecFile } from "../lib/exec-helper";
import { runningInsideFlatpak } from "../lib/flatpak-host";

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

    stringifyExec(args: string[]): string {
        return stringifyExecFile(this.file, this.defaultArgs.concat(args));
    }
}

/** Host FreeRDP when WinBoat itself runs as a Flatpak (no host binaries in PATH). */
const freeRDPInstallationsFlatpak = [
    new FreeRDPInstallation("flatpak-spawn", ["--host", "xfreerdp3"]),
    new FreeRDPInstallation("flatpak-spawn", ["--host", "xfreerdp"]),
    new FreeRDPInstallation("flatpak-spawn", ["--host", "flatpak", "run", "--command=xfreerdp", "com.freerdp.FreeRDP"]),
];

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
    const candidates = runningInsideFlatpak()
        ? [...freeRDPInstallationsFlatpak, ...freeRDPInstallations]
        : freeRDPInstallations;
    for (let installation of candidates) {
        try {
            const shellOutput = await installation.exec(["--version"]);
            if (shellOutput.stdout.includes(VERSION_3_STRING)) {
                return installation;
            }
        } catch {}
    }
    return null;
}
