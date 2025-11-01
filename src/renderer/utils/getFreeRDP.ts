import { execFileAsync } from "../lib/async-exec";

const { exec }: typeof import("child_process") = require("child_process");
const { promisify }: typeof import("util") = require("util");

type freeRDPWrapper = (args: string[]) => Promise<{
    stdout: string;
    stderr: string;
}>;

function getWrapper(file: string, args?: string[]): freeRDPWrapper {
    return function (extra_args: string[]) {
        return execFileAsync(file, (args || []).concat(extra_args));
    };
}

const freeRDPWrappers = [
    getWrapper("xfreerdp3"),
    getWrapper("xfreerdp"),
    getWrapper("flatpak", ["run", "--command=xfreerdp", "com.freerdp.FreeRDP"]),
];

/**
 * Returns the correct FreeRDP 3.x.x command available on the system or null
 */
export async function getFreeRDP() {
    const VERSION_3_STRING = "version 3.";
    for (let wrappers of freeRDPWrappers) {
        try {
            const shellOutput = await wrappers(["--version"]);
            if (shellOutput.stdout.includes(VERSION_3_STRING)) {
                return wrappers;
            }
        } catch {}
    }
    return null;
}
