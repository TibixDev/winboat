import { containerLogger } from "./container";
import { execFileAsync } from "../exec-helper";
import {
    RootlessPortForwardError,
    type PodmanRunner,
} from "./rootless-port-forward-definition";

export function createDefaultPodmanRunner(): PodmanRunner {
    return {
        exec: async args => {
            const { stdout, stderr } = await execFileAsync("podman", [...args]);
            return { stdout: stdout ?? "", stderr: stderr ?? "" };
        },
    };
}

export async function isPodmanRootless(runner: PodmanRunner = createDefaultPodmanRunner()): Promise<boolean> {
    try {
        const { stdout } = await runner.exec(["info", "--format", "{{.Host.Security.Rootless}}"]);
        const value = stdout.trim().toLowerCase();
        if (value === "true") return true;
        if (value === "false") return false;
        throw new RootlessPortForwardError(
            "podman_info_invalid",
            `podman info returned an unexpected rootless value: ${JSON.stringify(stdout.trim())}`,
        );
    } catch (error) {
        if (error instanceof RootlessPortForwardError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        containerLogger.error("isPodmanRootless probe failed");
        containerLogger.error(error);
        throw new RootlessPortForwardError(
            "podman_info_failed",
            `podman info failed while probing rootless mode: ${message}`,
        );
    }
}
