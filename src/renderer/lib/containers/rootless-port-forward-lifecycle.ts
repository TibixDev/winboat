import { containerLogger } from "./container";
import { ensureRootlessGuestPortForwards } from "./rootless-port-forward-cutover";
import {
    RootlessPortForwardError,
    type PodmanRunner,
} from "./rootless-port-forward-definition";
import { createDefaultPodmanRunner, isPodmanRootless } from "./rootless-port-forward-runtime";

export function shouldRecoverForwardsOnCompose(direction: string): boolean {
    return direction === "up";
}

export function shouldRecoverForwardsOnContainerAction(action: string): boolean {
    return action === "start" || action === "restart";
}

export function shouldRecoverForwardsOnAppRunning(runtime: string): boolean {
    return runtime === "Podman";
}

export const ROOTLESS_FORWARD_RECOVERY_INTERVAL_MS = 10_000;

export function shouldAttemptPeriodicRootlessRecovery(
    runtime: string,
    containerStatus: string,
    nowMs: number,
    lastAttemptMs: number,
    inFlight: boolean,
    intervalMs = ROOTLESS_FORWARD_RECOVERY_INTERVAL_MS,
): boolean {
    return (
        shouldRecoverForwardsOnAppRunning(runtime) &&
        containerStatus === "Running" &&
        !inFlight &&
        nowMs - lastAttemptMs >= intervalMs
    );
}

export async function ensureRootlessForwardsIfNeeded(
    containerName: string,
    options?: { readonly fatalOnError?: boolean; readonly runner?: PodmanRunner },
): Promise<void> {
    const runner = options?.runner ?? createDefaultPodmanRunner();
    const fatal = options?.fatalOnError !== false;
    try {
        if (!(await isPodmanRootless(runner))) return;
    } catch (error) {
        if (!(error instanceof RootlessPortForwardError)) throw error;
        containerLogger.error(`[rootless-forward] ${error.code}: ${error.message}`);
        if (fatal) throw error;
        return;
    }
    await ensureRootlessGuestPortForwards({ containerName, fatalOnError: fatal, runner });
}

export async function recoverRootlessForwardsOnAppRunning(
    runtime: string,
    containerName: string,
    ensure: (name: string) => Promise<void> = name =>
        ensureRootlessForwardsIfNeeded(name, { fatalOnError: true }),
): Promise<boolean> {
    if (!shouldRecoverForwardsOnAppRunning(runtime)) return false;
    await ensure(containerName);
    return true;
}
