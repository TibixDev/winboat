const { exec }: typeof import('child_process') = require('child_process');
const { promisify }: typeof import('util') = require('util');

const execAsync = promisify(exec);
export const FreeRDPAliases = ["xfreerdp3", "xfreerdp", "flatpak run --command=xfreerdp com.freerdp.FreeRDP"];

/**
 * Returns the freerdp command available on the system
 */
export async function getFreeRDP() {
    // The bash command used tries running both `xfreerdp3`, `xfreerdp` and `flatpak run --command=xfreerdp com.freerdp.FreeRDP`,
    // piping their outputs to `/dev/null`, then echoes some string if the command succeeded.
    return (await execAsync(FreeRDPAliases.map((alias) => `(${alias} > /dev/null 2>&1 && echo "${alias}")`).join("||"))).stdout.split("\n")[0];
}