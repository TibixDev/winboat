import { containerLogger } from "./container";
import {
    GUEST_FORWARDER_CONTAINER_PATH,
    LEGACY_FORWARDER_CONTAINER_PATHS,
    RootlessPortForwardError,
    type ForwarderProcessKind,
    type GuestForwardSpec,
    type PodmanRunner,
} from "./rootless-port-forward-definition";
import { createDefaultPodmanRunner } from "./rootless-port-forward-runtime";

type ParsedProcess = {
    readonly pid: number;
    readonly argv: readonly string[];
    readonly kind: Exclude<ForwarderProcessKind, "any">;
};

function ownedKind(argv0: string): ParsedProcess["kind"] | null {
    if (argv0 === GUEST_FORWARDER_CONTAINER_PATH) return "product";
    if (LEGACY_FORWARDER_CONTAINER_PATHS.some(candidate => candidate === argv0)) return "legacy";
    return null;
}

function parseOwnedProcess(line: string): ParsedProcess | null {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!match) return null;
    const pidText = match[1];
    const argsText = match[2];
    if (!pidText || !argsText) return null;
    const argv = argsText.trim().split(/\s+/);
    const argv0 = argv[0];
    if (!argv0) return null;
    const kind = ownedKind(argv0);
    const pid = Number(pidText);
    if (!kind || !Number.isSafeInteger(pid) || pid <= 0) return null;
    return { pid, argv, kind };
}

function flagValue(argv: readonly string[], flag: string): string | null {
    const index = argv.indexOf(flag);
    return index >= 0 ? (argv[index + 1] ?? null) : null;
}

function assertNever(value: never): never {
    throw new RootlessPortForwardError("process_kind_invalid", `unexpected forwarder process kind: ${String(value)}`);
}

function processMatchesSpec(process: ParsedProcess, spec: GuestForwardSpec): boolean {
    const listen = `0.0.0.0:${spec.listenPort}`;
    const dial = `${spec.dialHost}:${spec.dialPort}`;
    const kind = process.kind;
    switch (kind) {
        case "legacy":
            if (process.argv[0] !== "/tmp/winboat-tcp-forward") {
                return (
                    flagValue(process.argv, "-proto") === spec.proto &&
                    flagValue(process.argv, "-listen") === listen &&
                    flagValue(process.argv, "-dial") === dial
                );
            }
            return spec.proto === "tcp" && process.argv[1] === listen && process.argv[2] === dial;
        case "product":
            return (
                flagValue(process.argv, "-proto") === spec.proto &&
                flagValue(process.argv, "-listen") === listen &&
                flagValue(process.argv, "-dial") === dial
            );
        default:
            return assertNever(kind);
    }
}

function ownedProcesses(processListing: string): readonly ParsedProcess[] {
    return processListing
        .split("\n")
        .map(parseOwnedProcess)
        .filter((process): process is ParsedProcess => process !== null);
}

export function specsNeedingStart(
    specs: readonly GuestForwardSpec[],
    processListing: string,
    options?: { readonly honorLegacy?: boolean },
): readonly GuestForwardSpec[] {
    const processes = ownedProcesses(processListing);
    return specs.filter(spec =>
        processes.every(process => {
            if (process.kind === "legacy" && options?.honorLegacy !== true) return true;
            return !processMatchesSpec(process, spec);
        }),
    );
}

export function hasUnexpectedOwnedForwarderProcess(
    processListing: string,
    specs: readonly GuestForwardSpec[],
): boolean {
    return ownedProcesses(processListing).some(process => {
        if (process.kind === "legacy") return true;
        return specs.every(spec => !processMatchesSpec(process, spec));
    });
}

export function parseForwarderPidsFromPs(psText: string, kind: ForwarderProcessKind): readonly number[] {
    return ownedProcesses(psText)
        .filter(process => kind === "any" || process.kind === kind)
        .map(process => process.pid);
}

export async function listForwarderPids(
    containerName: string,
    kind: ForwarderProcessKind = "any",
    runner: PodmanRunner = createDefaultPodmanRunner(),
): Promise<readonly number[]> {
    const { stdout } = await runner.exec(["exec", containerName, "sh", "-c", "ps -eo pid=,args="]);
    return parseForwarderPidsFromPs(stdout, kind);
}

export async function stopGuestPortForwarders(
    containerName: string,
    kind: ForwarderProcessKind = "any",
    runner: PodmanRunner = createDefaultPodmanRunner(),
): Promise<readonly number[]> {
    const pids = await listForwarderPids(containerName, kind, runner);
    return stopForwarderPids(containerName, pids, runner);
}

export async function stopForwarderPids(
    containerName: string,
    pids: readonly number[],
    runner: PodmanRunner = createDefaultPodmanRunner(),
): Promise<readonly number[]> {
    const targets = new Set(pids);
    for (const pid of pids) {
        await runner.exec(["exec", containerName, "kill", String(pid)]).catch(error => {
            containerLogger.warn(`forwarder pid ${pid} did not accept kill; verifying process state`);
            containerLogger.warn(error);
        });
    }
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const remaining = (await listForwarderPids(containerName, "any", runner)).filter(pid => targets.has(pid));
        if (remaining.length === 0) return pids;
        if (attempt < 9) await new Promise(resolve => setTimeout(resolve, 50));
        else {
            throw new RootlessPortForwardError(
                "stop_failed",
                `forwarder process(es) still running after kill: ${remaining.join(", ")}`,
            );
        }
    }
    return pids;
}

export function verifyForwardersRunning(specs: readonly GuestForwardSpec[], processListing: string): void {
    const missing = specsNeedingStart(specs, processListing);
    if (missing.length === 0) return;
    const labels = missing.map(spec => `${spec.proto}/${spec.listenPort}`).join(", ");
    throw new RootlessPortForwardError(
        "process_verify_failed",
        `guest-port-forward process(es) missing after start: ${labels}`,
    );
}
