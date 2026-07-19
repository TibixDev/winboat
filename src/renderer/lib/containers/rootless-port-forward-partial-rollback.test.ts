import { describe, expect, test } from "bun:test";
import { ensureRootlessGuestPortForwards } from "./rootless-port-forward-cutover";
import { GUEST_FORWARDER_CONTAINER_PATH, defaultGuestForwardSpecs } from "./rootless-port-forward-definition";
import { FakePodmanRunner, allProductProcesses } from "./rootless-port-forward.test-support";

const binaryHostPath = "/host/guest-port-forward-linux-arm64";
const specs = defaultGuestForwardSpecs();

describe("partial rootless forward recovery rollback", () => {
    test("preserves healthy RDP forwarders when the missing guest API listener cannot start", async () => {
        const healthyRdpSpecs = specs.slice(1);
        const originalProcesses = allProductProcesses(healthyRdpSpecs);
        const runner = new FakePodmanRunner({
            processes: originalProcesses,
            fail: args =>
                args[0] === "exec" && args[1] === "-d" && args.includes("0.0.0.0:7148")
                    ? new Error("port occupied")
                    : null,
        });

        await expect(
            ensureRootlessGuestPortForwards({
                containerName: "WinBoat",
                binaryHostPath,
                existsSync: path => path === binaryHostPath,
                replaceExisting: false,
                runner,
                sleepMs: async () => {},
                fatalOnError: true,
            }),
        ).rejects.toMatchObject({ code: "exec_failed" });

        expect([...runner.processes.keys()]).toEqual(originalProcesses.map(process => process.pid));
        expect(runner.calls.filter(args => args[0] === "exec" && args[2] === "kill")).toHaveLength(0);
        expect(runner.files.get(GUEST_FORWARDER_CONTAINER_PATH)).toBe("old-binary");
    });

    test("removes only forwarders started by the failed partial recovery", async () => {
        const originalProcesses = allProductProcesses(specs.slice(0, 1));
        const runner = new FakePodmanRunner({
            processes: originalProcesses,
            fail: args =>
                args[0] === "exec" && args[1] === "-d" && args.includes("-proto") && args.includes("udp")
                    ? new Error("udp unavailable")
                    : null,
        });

        await expect(
            ensureRootlessGuestPortForwards({
                containerName: "WinBoat",
                binaryHostPath,
                existsSync: path => path === binaryHostPath,
                replaceExisting: false,
                runner,
                sleepMs: async () => {},
                fatalOnError: true,
            }),
        ).rejects.toMatchObject({ code: "exec_failed" });

        expect([...runner.processes.keys()]).toEqual(originalProcesses.map(process => process.pid));
        expect(runner.calls.filter(args => args[0] === "exec" && args[2] === "kill")).toEqual([
            ["exec", "WinBoat", "kill", "10000"],
        ]);
        expect(runner.files.get(GUEST_FORWARDER_CONTAINER_PATH)).toBe("old-binary");
    });
});
