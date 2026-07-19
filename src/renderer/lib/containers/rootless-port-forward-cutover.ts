import { containerLogger } from "./container";
import { hostForwarderBinaryPath } from "./rootless-port-forward-binary";
import {
    GUEST_FORWARDER_CONTAINER_PATH,
    RootlessPortForwardError,
    assertForwardSpecsSafe,
    defaultGuestForwardSpecs,
    type EnsureForwardOptions,
    type EnsureForwardResult,
    type GuestForwardSpec,
    type PodmanRunner,
} from "./rootless-port-forward-definition";
import {
    hasUnexpectedOwnedForwarderProcess,
    parseForwarderPidsFromPs,
    specsNeedingStart,
    stopGuestPortForwarders,
    verifyForwardersRunning,
} from "./rootless-port-forward-process";
import { rollbackRootlessForwarders } from "./rootless-port-forward-rollback";
import { runContainerForwardEnsureSerialized } from "./rootless-port-forward-lock";
import { createDefaultPodmanRunner } from "./rootless-port-forward-runtime";

const fs: typeof import("node:fs") = require("node:fs");
const { randomUUID }: typeof import("node:crypto") = require("node:crypto");
const processRef: typeof import("node:process") = require("node:process");

type CutoverContext = {
    readonly containerName: string;
    readonly runner: PodmanRunner;
    readonly sleep: (ms: number) => Promise<void>;
};

type RunnerStep = {
    readonly code: string;
    readonly label: string;
    readonly args: readonly string[];
};

async function runStep(context: CutoverContext, step: RunnerStep): Promise<{ readonly stdout: string }> {
    try {
        return await context.runner.exec(step.args);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new RootlessPortForwardError(step.code, `${step.label}: ${message}`);
    }
}

async function processListing(context: CutoverContext, code = "ps_failed"): Promise<string> {
    const result = await runStep(context, {
        code,
        label: "list forwarder processes",
        args: ["exec", context.containerName, "sh", "-c", "ps -eo pid=,args="],
    });
    return result.stdout;
}

async function targetExists(context: CutoverContext): Promise<boolean> {
    const result = await runStep(context, {
        code: "target_probe_failed",
        label: "probe installed forwarder",
        args: [
            "exec",
            context.containerName,
            "sh",
            "-c",
            'if [ -e "$1" ]; then printf "present\\n"; else printf "absent\\n"; fi',
            "sh",
            GUEST_FORWARDER_CONTAINER_PATH,
        ],
    });
    const value = result.stdout.trim();
    if (value === "present") return true;
    if (value === "absent") return false;
    throw new RootlessPortForwardError("target_probe_invalid", `unexpected target probe output: ${value}`);
}

async function startSpecs(
    context: CutoverContext,
    specs: readonly GuestForwardSpec[],
    errorCode: string,
): Promise<readonly string[]> {
    const started: string[] = [];
    for (const spec of specs) {
        const label = `${spec.proto}/${spec.listenPort}`;
        await runStep(context, {
            code: errorCode,
            label: `start guest-port-forward ${label}`,
            args: [
                "exec",
                "-d",
                context.containerName,
                GUEST_FORWARDER_CONTAINER_PATH,
                "-proto",
                spec.proto,
                "-listen",
                `0.0.0.0:${spec.listenPort}`,
                "-dial",
                `${spec.dialHost}:${spec.dialPort}`,
            ],
        });
        started.push(label);
    }
    return started;
}

async function removePath(context: CutoverContext, candidate: string, code: string): Promise<void> {
    await runStep(context, {
        code,
        label: `remove ${candidate}`,
        args: ["exec", context.containerName, "rm", "-f", candidate],
    });
}

async function performRootlessGuestPortForwardEnsure(options: EnsureForwardOptions): Promise<EnsureForwardResult> {
    const fatal = options.fatalOnError !== false;
    const runner = options.runner ?? createDefaultPodmanRunner();
    const sleep = options.sleepMs ?? (async (ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
    const exists = options.existsSync ?? fs.existsSync;
    const context: CutoverContext = { containerName: options.containerName, runner, sleep };
    const token = `${processRef.pid}-${randomUUID()}`;
    const stagePath = `/usr/local/bin/.guest-port-forward-stage-${token}`;
    const backupPath = `/usr/local/bin/.guest-port-forward-backup-${token}`;
    let stagePresent = false;
    let backupPresent = false;

    try {
        const specs = options.specs ?? defaultGuestForwardSpecs(options.guestIP);
        assertForwardSpecsSafe(specs);
        const before = await processListing(context);
        const missing = specsNeedingStart(specs, before);
        const skipped = specs
            .filter(spec => !missing.includes(spec))
            .map(spec => `${spec.proto}/${spec.listenPort}`);
        if (missing.length === 0 && options.replaceExisting !== true) {
            return { started: [], skipped, stopped: [] };
        }

        const replaceAll = options.replaceExisting === true || hasUnexpectedOwnedForwarderProcess(before, specs);
        const need = replaceAll ? specs : missing;
        const hasOwnedListeners = parseForwarderPidsFromPs(before, "any").length > 0;
        const hostBinary = options.binaryHostPath ?? hostForwarderBinaryPath();
        if (!exists(hostBinary)) {
            throw new RootlessPortForwardError("binary_missing", `binary not found: ${hostBinary}`);
        }

        await runStep(context, {
            code: "cp_failed",
            label: "copy candidate forwarder",
            args: ["cp", hostBinary, `${options.containerName}:${stagePath}`],
        });
        stagePresent = true;
        await runStep(context, {
            code: "chmod_failed",
            label: "make candidate forwarder executable",
            args: ["exec", options.containerName, "chmod", "+x", stagePath],
        });
        await runStep(context, {
            code: "preflight_failed",
            label: "preflight candidate forwarder",
            args: ["exec", options.containerName, stagePath, "-h"],
        });

        const installedTargetExists = await targetExists(context);
        if (replaceAll && hasOwnedListeners && !installedTargetExists) {
            throw new RootlessPortForwardError(
                "rollback_unavailable",
                "refusing to stop exact-owned listeners because the installed binary cannot be backed up",
            );
        }
        if (installedTargetExists) {
            await runStep(context, {
                code: "backup_failed",
                label: "preserve installed forwarder",
                args: ["exec", options.containerName, "mv", "-f", GUEST_FORWARDER_CONTAINER_PATH, backupPath],
            });
            backupPresent = true;
        }
        try {
            await runStep(context, {
                code: "deploy_failed",
                label: "install candidate forwarder",
                args: ["exec", options.containerName, "mv", "-f", stagePath, GUEST_FORWARDER_CONTAINER_PATH],
            });
            stagePresent = false;
        } catch (primaryError) {
            if (backupPresent) {
                await runStep(context, {
                    code: "rollback_failed",
                    label: "restore installed forwarder after deployment failure",
                    args: ["exec", options.containerName, "mv", "-f", backupPath, GUEST_FORWARDER_CONTAINER_PATH],
                });
                backupPresent = false;
            }
            throw primaryError;
        }

        let stopped: readonly number[] = [];
        try {
            if (replaceAll) {
                stopped = await stopGuestPortForwarders(options.containerName, "any", runner);
                await sleep(400);
            }
            const started = await startSpecs(context, need, "exec_failed");
            await sleep(50);
            verifyForwardersRunning(specs, await processListing(context));
            if (backupPresent) {
                await removePath(context, backupPath, "cleanup_failed");
                backupPresent = false;
            }
            return { started, skipped: replaceAll ? [] : skipped, stopped };
        } catch (primaryError) {
            if (!backupPresent) throw primaryError;
            return await rollbackRootlessForwarders({
                containerName: options.containerName,
                runner,
                sleep,
                replaceAll,
                before,
                missing,
                specs,
                backupPath,
                primaryError,
                onBackupRestored: () => (backupPresent = false),
            });
        }
    } catch (error) {
        const typedError =
            error instanceof RootlessPortForwardError
                ? error
                : new RootlessPortForwardError(
                      "ensure_failed",
                      `rootless guest port forward failed: ${error instanceof Error ? error.message : String(error)}`,
                  );
        containerLogger.error(`[rootless-forward] ${typedError.code}: ${typedError.message}`);
        if (fatal) throw typedError;
        return { started: [], skipped: [], stopped: [] };
    } finally {
        if (stagePresent) {
            try {
                await removePath(context, stagePath, "cleanup_failed");
            } catch (cleanupError) {
                containerLogger.warn("failed to remove staged forwarder after unsuccessful cutover");
                containerLogger.warn(cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
            }
        }
        if (backupPresent) {
            containerLogger.warn("previous forwarder backup retained after unsuccessful rollback");
        }
    }
}

export function ensureRootlessGuestPortForwards(options: EnsureForwardOptions): Promise<EnsureForwardResult> {
    return runContainerForwardEnsureSerialized(options.containerName, () =>
        performRootlessGuestPortForwardEnsure(options),
    );
}
