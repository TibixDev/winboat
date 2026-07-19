import { describe, expect, test } from "bun:test";
import { ensureRootlessGuestPortForwards } from "./rootless-port-forward-cutover";
import {
    GUEST_FORWARDER_CONTAINER_PATH,
    defaultGuestForwardSpecs,
} from "./rootless-port-forward-definition";
import {
    FakePodmanRunner,
    allProductProcesses,
    callIndex,
} from "./rootless-port-forward.test-support";

const binaryHostPath = "/host/guest-port-forward-linux-arm64";
const specs = defaultGuestForwardSpecs();
const existsSync = (path: string): boolean => path === binaryHostPath;

function ensure(runner: FakePodmanRunner, replaceExisting = true) {
    return ensureRootlessGuestPortForwards({
        containerName: "WinBoat",
        binaryHostPath,
        existsSync,
        replaceExisting,
        runner,
        sleepMs: async () => {},
        fatalOnError: true,
    });
}

describe("atomic forwarder cutover", () => {
    test("preflights a same-directory stage and preserves target before killing listeners", async () => {
        const runner = new FakePodmanRunner({ processes: allProductProcesses(specs) });
        const result = await ensure(runner);

        const preflight = callIndex(runner, args => args[0] === "exec" && args[3] === "-h");
        const backupMove = callIndex(
            runner,
            args => args[0] === "exec" && args[2] === "mv" && args[5]?.includes(".guest-port-forward-backup-"),
        );
        const targetMove = callIndex(
            runner,
            args => args[0] === "exec" && args[2] === "mv" && args[5] === GUEST_FORWARDER_CONTAINER_PATH,
        );
        const firstKill = callIndex(runner, args => args[0] === "exec" && args[2] === "kill");
        const stagePath = runner.calls.find(args => args[0] === "cp")?.[2]?.split(":").at(-1);

        expect(stagePath?.startsWith("/usr/local/bin/.guest-port-forward-stage-")).toBe(true);
        expect(preflight).toBeGreaterThanOrEqual(0);
        expect(backupMove).toBeGreaterThan(preflight);
        expect(targetMove).toBeGreaterThan(backupMove);
        expect(firstKill).toBeGreaterThan(targetMove);
        expect(result.started).toEqual(["tcp/7148", "tcp/3389", "udp/3389"]);
        expect(runner.files.get(GUEST_FORWARDER_CONTAINER_PATH)).toBe("candidate-binary");
        expect([...runner.files.keys()].some(path => path.includes("stage-") || path.includes("backup-"))).toBe(false);
    });

    test("does not alter listeners or target when candidate preflight fails", async () => {
        const original = allProductProcesses(specs);
        const runner = new FakePodmanRunner({
            processes: original,
            fail: args =>
                args[0] === "exec" && args[2]?.includes(".guest-port-forward-stage-") && args[3] === "-h"
                    ? new Error("bad candidate")
                    : null,
        });

        await expect(ensure(runner)).rejects.toMatchObject({ code: "preflight_failed" });
        expect(runner.files.get(GUEST_FORWARDER_CONTAINER_PATH)).toBe("old-binary");
        expect(runner.processes.size).toBe(original.length);
        expect(runner.calls.some(args => args[2] === "kill")).toBe(false);
        expect([...runner.files.keys()].some(path => path.includes("stage-"))).toBe(false);
    });

    test("restores backup and old full set while returning primary exec_failed", async () => {
        const runner = new FakePodmanRunner({
            processes: allProductProcesses(specs),
            fail: (args, state) =>
                args[0] === "exec" && args[1] === "-d" && state.startAttempts === 1
                    ? new Error("new binary refused detached start")
                    : null,
        });

        await expect(ensure(runner)).rejects.toMatchObject({ code: "exec_failed" });
        expect(runner.files.get(GUEST_FORWARDER_CONTAINER_PATH)).toBe("old-binary");
        expect(runner.processes.size).toBe(3);
        expect(runner.startAttempts).toBe(4);
        expect([...runner.files.keys()].some(path => path.includes("backup-"))).toBe(false);
    });

    test("returns rollback_failed only when restoring the old full set also fails", async () => {
        const runner = new FakePodmanRunner({
            processes: allProductProcesses(specs),
            fail: (args, state) =>
                args[0] === "exec" && args[1] === "-d" && state.startAttempts <= 2
                    ? new Error("detached start failed")
                    : null,
        });

        await expect(ensure(runner)).rejects.toMatchObject({ code: "rollback_failed" });
        expect(runner.files.get(GUEST_FORWARDER_CONTAINER_PATH)).toBe("old-binary");
    });

    test("refuses destructive replacement without an old target backup", async () => {
        const runner = new FakePodmanRunner({
            targetContent: null,
            processes: allProductProcesses(specs),
        });

        await expect(ensure(runner)).rejects.toMatchObject({ code: "rollback_unavailable" });
        expect(runner.calls.some(args => args[2] === "kill")).toBe(false);
        expect(runner.processes.size).toBe(3);
        expect([...runner.files.keys()].some(path => path.includes("stage-"))).toBe(false);
    });

    test("restores the old target if atomic candidate installation fails", async () => {
        const runner = new FakePodmanRunner({
            processes: allProductProcesses(specs),
            fail: args =>
                args[0] === "exec" &&
                args[2] === "mv" &&
                args[4]?.includes(".guest-port-forward-stage-") &&
                args[5] === GUEST_FORWARDER_CONTAINER_PATH
                    ? new Error("install rename failed")
                    : null,
        });

        await expect(ensure(runner)).rejects.toMatchObject({ code: "deploy_failed" });
        expect(runner.files.get(GUEST_FORWARDER_CONTAINER_PATH)).toBe("old-binary");
        expect(runner.calls.some(args => args[2] === "kill")).toBe(false);
    });
});

describe("idempotent forward recovery", () => {
    test("starts only a missing UDP forwarder", async () => {
        const runner = new FakePodmanRunner({ processes: allProductProcesses(specs.slice(0, 2)) });
        const result = await ensure(runner, false);
        expect(result.started).toEqual(["udp/3389"]);
        expect(result.skipped).toEqual(["tcp/7148", "tcp/3389"]);
        expect(runner.startAttempts).toBe(1);
    });

    test("deploys a missing target without stopping healthy partial listeners", async () => {
        const runner = new FakePodmanRunner({
            targetContent: null,
            processes: allProductProcesses(specs.slice(0, 2)),
        });

        const result = await ensure(runner, false);

        expect(result).toEqual({
            started: ["udp/3389"],
            skipped: ["tcp/7148", "tcp/3389"],
            stopped: [],
        });
        expect(runner.calls.some(args => args[2] === "kill")).toBe(false);
        expect(runner.processes.size).toBe(3);
        expect(runner.files.get(GUEST_FORWARDER_CONTAINER_PATH)).toBe("candidate-binary");
    });

    test("retains rollback protection when an unexpected owned listener requires replacement", async () => {
        const wrongEndpoint = {
            ...specs[0],
            dialPort: 9999,
        };
        const runner = new FakePodmanRunner({
            targetContent: null,
            processes: allProductProcesses([wrongEndpoint]),
        });

        await expect(ensure(runner, false)).rejects.toMatchObject({ code: "rollback_unavailable" });

        expect(runner.calls.some(args => args[2] === "kill")).toBe(false);
        expect(runner.processes.size).toBe(1);
    });

    test("serializes two ensures for the same container without duplicate starts", async () => {
        const runner = new FakePodmanRunner({ processes: allProductProcesses(specs.slice(0, 2)) });

        const first = ensure(runner, false);
        const second = ensure(runner, false);
        const [firstResult, secondResult] = await Promise.all([first, second]);

        expect(first).not.toBe(second);
        expect(firstResult.started).toEqual(["udp/3389"]);
        expect(secondResult.started).toEqual([]);
        expect(secondResult.skipped).toEqual(["tcp/7148", "tcp/3389", "udp/3389"]);
        expect(runner.startAttempts).toBe(1);
    });

    test("preserves each caller's fatal policy while serialized", async () => {
        const runner = new FakePodmanRunner({
            processes: [],
            fail: args => (args[0] === "cp" ? new Error("copy failed") : null),
        });
        const nonfatal = ensureRootlessGuestPortForwards({
            containerName: "WinBoat",
            binaryHostPath,
            existsSync,
            runner,
            fatalOnError: false,
        });
        const fatal = ensureRootlessGuestPortForwards({
            containerName: "WinBoat",
            binaryHostPath,
            existsSync,
            runner,
            fatalOnError: true,
        });

        const [nonfatalOutcome, fatalOutcome] = await Promise.allSettled([nonfatal, fatal]);
        expect(nonfatalOutcome).toEqual({
            status: "fulfilled",
            value: { started: [], skipped: [], stopped: [] },
        });
        expect(fatalOutcome.status).toBe("rejected");
        if (fatalOutcome.status === "rejected") {
            expect(fatalOutcome.reason).toMatchObject({ code: "cp_failed" });
        }
        expect(runner.calls.filter(args => args[0] === "cp")).toHaveLength(2);
    });

    test("does not copy or resolve a binary when the full set is healthy", async () => {
        const runner = new FakePodmanRunner({ processes: allProductProcesses(specs) });
        const result = await ensureRootlessGuestPortForwards({
            containerName: "WinBoat",
            binaryHostPath: "/missing",
            existsSync: () => false,
            runner,
            fatalOnError: true,
        });
        expect(result.started).toEqual([]);
        expect(runner.calls.some(args => args[0] === "cp")).toBe(false);
    });

    test("maps copy and chmod failures to stable error codes", async () => {
        for (const failure of [
            { code: "cp_failed", matches: (args: readonly string[]) => args[0] === "cp" },
            {
                code: "chmod_failed",
                matches: (args: readonly string[]) => args[0] === "exec" && args[2] === "chmod",
            },
        ]) {
            const runner = new FakePodmanRunner({
                processes: [],
                fail: args => (failure.matches(args) ? new Error(failure.code) : null),
            });
            await expect(ensure(runner, false)).rejects.toMatchObject({ code: failure.code });
        }
    });

    test("reports a missing host binary before copying or changing listeners", async () => {
        const runner = new FakePodmanRunner({ processes: allProductProcesses(specs.slice(0, 2)) });
        await expect(
            ensureRootlessGuestPortForwards({
                containerName: "WinBoat",
                binaryHostPath: "/missing",
                existsSync: () => false,
                runner,
                fatalOnError: true,
            }),
        ).rejects.toMatchObject({ code: "binary_missing" });
        expect(runner.calls.some(args => args[0] === "cp" || args[2] === "kill")).toBe(false);
    });

    test("returns an empty result instead of throwing when configured nonfatal", async () => {
        const runner = new FakePodmanRunner({
            processes: [],
            fail: args => (args[0] === "cp" ? new Error("copy failed") : null),
        });
        const result = await ensureRootlessGuestPortForwards({
            containerName: "WinBoat",
            binaryHostPath,
            existsSync,
            runner,
            fatalOnError: false,
        });
        expect(result).toEqual({ started: [], skipped: [], stopped: [] });
    });
});
