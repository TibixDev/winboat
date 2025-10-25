const { exec }: typeof import("child_process") = require("node:child_process");
const { promisify }: typeof import("util") = require("node:util");

const execAsync = promisify(exec);
const freeRDPAliases = ["xfreerdp3", "xfreerdp", "flatpak run --command=xfreerdp com.freerdp.FreeRDP"];

/**
 * Returns the correct FreeRDP 3.x.x command available on the system or null
 */
export async function getFreeRDP() {
    const VERSION_3_STRING = "version 3.";
    for (let alias of freeRDPAliases) {
        try {
            const shellOutput = await execAsync(`${alias} --version`);
            if (shellOutput.stdout.includes(VERSION_3_STRING)) {
                console.log("[getFreeRDP] Correct FreeRDP alias is", alias);
                return alias;
            }
        } catch {}
    }
    return null;
}
