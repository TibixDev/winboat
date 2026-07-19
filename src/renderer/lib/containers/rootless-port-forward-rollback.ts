import { containerLogger } from "./container";
import {
    GUEST_FORWARDER_CONTAINER_PATH,
    RootlessPortForwardError,
    type GuestForwardSpec,
    type PodmanRunner,
} from "./rootless-port-forward-definition";
import {
    parseForwarderPidsFromPs,
    stopForwarderPids,
    stopGuestPortForwarders,
    verifyForwardersRunning,
} from "./rootless-port-forward-process";

type RollbackOptions = {
    readonly containerName: string;
    readonly runner: PodmanRunner;
    readonly sleep: (ms: number) => Promise<void>;
    readonly replaceAll: boolean;
    readonly before: string;
    readonly missing: readonly GuestForwardSpec[];
    readonly specs: readonly GuestForwardSpec[];
    readonly backupPath: string;
    readonly primaryError: unknown;
    readonly onBackupRestored: () => void;
};

async function rollbackStep(options: RollbackOptions, label: string, args: readonly string[]): Promise<string> {
    try {
        return (await options.runner.exec(args)).stdout;
    } catch (error) {
        throw new RootlessPortForwardError(
            "rollback_failed",
            `${label}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

async function startRollbackSpecs(options: RollbackOptions): Promise<void> {
    for (const spec of options.specs) {
        await rollbackStep(options, `start guest-port-forward ${spec.proto}/${spec.listenPort}`, [
            "exec",
            "-d",
            options.containerName,
            GUEST_FORWARDER_CONTAINER_PATH,
            "-proto",
            spec.proto,
            "-listen",
            `0.0.0.0:${spec.listenPort}`,
            "-dial",
            `${spec.dialHost}:${spec.dialPort}`,
        ]);
    }
}

export async function rollbackRootlessForwarders(options: RollbackOptions): Promise<never> {
    try {
        if (options.replaceAll) {
            await stopGuestPortForwarders(options.containerName, "any", options.runner);
        } else {
            const baselinePids = new Set(parseForwarderPidsFromPs(options.before, "any"));
            const current = await rollbackStep(options, "list forwarder processes", [
                "exec",
                options.containerName,
                "sh",
                "-c",
                "ps -eo pid=,args=",
            ]);
            const newPids = parseForwarderPidsFromPs(current, "any").filter(pid => !baselinePids.has(pid));
            await stopForwarderPids(options.containerName, newPids, options.runner);
        }
        await rollbackStep(options, "restore previous forwarder binary", [
            "exec",
            options.containerName,
            "mv",
            "-f",
            options.backupPath,
            GUEST_FORWARDER_CONTAINER_PATH,
        ]);
        options.onBackupRestored();
        if (options.replaceAll) await startRollbackSpecs(options);
        await options.sleep(50);
        const listing = await rollbackStep(options, "list forwarder processes", [
            "exec",
            options.containerName,
            "sh",
            "-c",
            "ps -eo pid=,args=",
        ]);
        const expected = options.replaceAll
            ? options.specs
            : options.specs.filter(spec => !options.missing.includes(spec));
        verifyForwardersRunning(expected, listing);
        containerLogger.warn(
            options.replaceAll
                ? "forwarder cutover failed; previous forwarding set restored"
                : "forwarder recovery failed; pre-existing forwarding set preserved",
        );
    } catch (rollbackError) {
        throw new RootlessPortForwardError(
            "rollback_failed",
            `forwarder cutover failed and rollback failed: ${String(options.primaryError)}; rollback: ${String(rollbackError)}`,
        );
    }
    throw options.primaryError;
}
