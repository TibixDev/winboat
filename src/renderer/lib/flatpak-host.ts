const process: typeof import("process") = require("node:process");

/** True when WinBoat runs as a Flatpak (e.g. app.winboat.WinBoat). */
export function runningInsideFlatpak(): boolean {
    return Boolean(process.env.FLATPAK_ID);
}

/**
 * Run a host binary from inside Flatpak. The Docker/Podman CLIs and host `id` are not in the sandbox PATH;
 * the engine is reached via mounted sockets, so commands must execute on the host.
 */
export function hostExec(cmd: string, args: readonly string[]): { file: string; args: string[] } {
    if (runningInsideFlatpak()) {
        return { file: "flatpak-spawn", args: ["--host", cmd, ...args] };
    }
    return { file: cmd, args: [...args] };
}
