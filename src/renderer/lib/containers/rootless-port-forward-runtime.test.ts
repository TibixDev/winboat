import { describe, expect, test } from "bun:test";
import {
    ensureRootlessForwardsIfNeeded,
    recoverRootlessForwardsOnAppRunning,
    shouldAttemptPeriodicRootlessRecovery,
    shouldRecoverForwardsOnAppRunning,
    shouldRecoverForwardsOnCompose,
    shouldRecoverForwardsOnContainerAction,
} from "./rootless-port-forward-lifecycle";
import { isPodmanRootless } from "./rootless-port-forward-runtime";
import { FakePodmanRunner } from "./rootless-port-forward.test-support";

describe("Podman rootless parsing", () => {
    test("accepts only true and false output", async () => {
        expect(await isPodmanRootless(new FakePodmanRunner({ rootlessOutput: "true\n" }))).toBe(true);
        expect(await isPodmanRootless(new FakePodmanRunner({ rootlessOutput: "false\n" }))).toBe(false);
        await expect(isPodmanRootless(new FakePodmanRunner({ rootlessOutput: "yes\n" }))).rejects.toMatchObject({
            code: "podman_info_invalid",
        });
    });

    test("maps probe execution failures without treating them as rootful", async () => {
        const runner = new FakePodmanRunner({
            fail: args => (args[0] === "info" ? new Error("probe failed") : null),
        });
        await expect(isPodmanRootless(runner)).rejects.toMatchObject({ code: "podman_info_failed" });
    });

    test("skips forwarding when Podman is rootful", async () => {
        const runner = new FakePodmanRunner({ rootlessOutput: "false\n" });
        await ensureRootlessForwardsIfNeeded("WinBoat", { runner, fatalOnError: true });
        expect(runner.calls).toHaveLength(1);
    });
});

describe("recovery lifecycle gating", () => {
    test("gates compose, container action, runtime and periodic recovery", () => {
        expect(shouldRecoverForwardsOnCompose("up")).toBe(true);
        expect(shouldRecoverForwardsOnCompose("down")).toBe(false);
        expect(shouldRecoverForwardsOnContainerAction("restart")).toBe(true);
        expect(shouldRecoverForwardsOnContainerAction("stop")).toBe(false);
        expect(shouldRecoverForwardsOnAppRunning("Podman")).toBe(true);
        expect(shouldRecoverForwardsOnAppRunning("Docker")).toBe(false);
        expect(shouldAttemptPeriodicRootlessRecovery("Podman", "Running", 20_000, 0, false)).toBe(true);
        expect(shouldAttemptPeriodicRootlessRecovery("Podman", "Exited", 20_000, 0, false)).toBe(false);
    });

    test("invokes app-running recovery only for Podman", async () => {
        const calls: string[] = [];
        const ensure = async (name: string): Promise<void> => {
            calls.push(name);
        };
        expect(await recoverRootlessForwardsOnAppRunning("Podman", "WinBoat", ensure)).toBe(true);
        expect(await recoverRootlessForwardsOnAppRunning("Docker", "WinBoat", ensure)).toBe(false);
        expect(calls).toEqual(["WinBoat"]);
    });

    test("propagates a Podman recovery failure", async () => {
        const ensure = async (): Promise<void> => {
            throw new Error("recovery failed");
        };
        await expect(recoverRootlessForwardsOnAppRunning("Podman", "WinBoat", ensure)).rejects.toThrow(
            "recovery failed",
        );
    });
});
