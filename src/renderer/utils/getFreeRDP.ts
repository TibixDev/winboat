const { exec }: typeof import('child_process') = require('child_process');
const { promisify }: typeof import('util') = require('util');

const execAsync = promisify(exec);

/**
 * Returns the freerdp command available on the system
 */
export async function getFreeRDP() {
    // The bash command used tries running both `xfreerdp` and `xfreerdp3`, piping their outputs to `/dev/null`,
    // then echoes some string if the command succeeded.
    const freeRDPAliases = ["xfreerdp3", "xfreerdp", "flatpak run --command=xfreerdp com.freerdp.FreeRDP"];
    return (await execAsync(freeRDPAliases.map((alias) => `(${alias} > /dev/null 2>&1 && echo "${alias}")`).join("||"))).stdout.split("\n")[0];
}