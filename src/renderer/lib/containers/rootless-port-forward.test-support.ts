import {
    GUEST_FORWARDER_CONTAINER_PATH,
    type GuestForwardSpec,
    type PodmanExecResult,
    type PodmanRunner,
} from "./rootless-port-forward-definition";

export type FakeProcess = {
    readonly pid: number;
    readonly argv: readonly string[];
};

export type FakeRunnerOptions = {
    readonly targetContent?: string | null;
    readonly rootlessOutput?: string;
    readonly processes?: readonly FakeProcess[];
    readonly fail?: (args: readonly string[], runner: FakePodmanRunner) => Error | null;
};

function containerPath(copyDestination: string): string {
    const separator = copyDestination.indexOf(":");
    return separator >= 0 ? copyDestination.slice(separator + 1) : copyDestination;
}

export class FakePodmanRunner implements PodmanRunner {
    readonly calls: string[][] = [];
    readonly files = new Map<string, string>();
    readonly processes = new Map<number, readonly string[]>();
    readonly fail?: FakeRunnerOptions["fail"];
    readonly rootlessOutput: string;
    startAttempts = 0;
    private nextPid = 10_000;

    constructor(options: FakeRunnerOptions = {}) {
        this.fail = options.fail;
        this.rootlessOutput = options.rootlessOutput ?? "true\n";
        if (options.targetContent !== null) {
            this.files.set(GUEST_FORWARDER_CONTAINER_PATH, options.targetContent ?? "old-binary");
        }
        for (const process of options.processes ?? []) this.processes.set(process.pid, process.argv);
    }

    async exec(args: readonly string[]): Promise<PodmanExecResult> {
        const call = [...args];
        this.calls.push(call);
        if (args[0] === "exec" && args[1] === "-d") this.startAttempts += 1;
        const failure = this.fail?.(args, this);
        if (failure) throw failure;

        if (args[0] === "info") return { stdout: this.rootlessOutput, stderr: "" };
        if (args.some(arg => arg === "ps -eo pid=,args=")) {
            const stdout = [...this.processes]
                .map(([pid, argv]) => `${pid} ${argv.join(" ")}`)
                .join("\n");
            return { stdout, stderr: "" };
        }
        if (args[0] === "cp") {
            const destination = args[2];
            if (destination) this.files.set(containerPath(destination), "candidate-binary");
            return { stdout: "", stderr: "" };
        }
        if (args[0] === "exec" && args[2] === "sh" && args[4]?.includes("[ -e")) {
            const target = args[6];
            return { stdout: target && this.files.has(target) ? "present\n" : "absent\n", stderr: "" };
        }
        if (args[0] === "exec" && args[2] === "mv") {
            const source = args[4];
            const destination = args[5];
            if (!source || !destination || !this.files.has(source)) throw new Error("mv source missing");
            const content = this.files.get(source);
            if (!content) throw new Error("mv content missing");
            this.files.delete(source);
            this.files.set(destination, content);
            return { stdout: "", stderr: "" };
        }
        if (args[0] === "exec" && args[2] === "rm") {
            for (const candidate of args.slice(4)) this.files.delete(candidate);
            return { stdout: "", stderr: "" };
        }
        if (args[0] === "exec" && args[2] === "kill") {
            const pid = Number(args[3]);
            if (Number.isSafeInteger(pid)) this.processes.delete(pid);
            return { stdout: "", stderr: "" };
        }
        if (args[0] === "exec" && args[1] === "-d") {
            this.processes.set(this.nextPid, args.slice(3));
            this.nextPid += 1;
            return { stdout: "", stderr: "" };
        }
        return { stdout: "", stderr: "" };
    }
}

export function productProcess(pid: number, spec: GuestForwardSpec, executable = GUEST_FORWARDER_CONTAINER_PATH): FakeProcess {
    return {
        pid,
        argv: [
            executable,
            "-proto",
            spec.proto,
            "-listen",
            `0.0.0.0:${spec.listenPort}`,
            "-dial",
            `${spec.dialHost}:${spec.dialPort}`,
        ],
    };
}

export function allProductProcesses(specs: readonly GuestForwardSpec[]): readonly FakeProcess[] {
    return specs.map((spec, index) => productProcess(index + 100, spec));
}

export function callIndex(runner: FakePodmanRunner, predicate: (args: readonly string[]) => boolean): number {
    return runner.calls.findIndex(predicate);
}
