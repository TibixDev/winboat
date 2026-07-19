import { describe, expect, test } from "bun:test";
import path from "node:path";
import electronBuilder from "../../../../electron-builder.json";
import { GUEST_API_PORT, GUEST_RDP_PORT } from "../constants";
import {
    candidateGuestPortForwardPaths,
    goArchFromNodeArch,
    resolveGuestPortForwardBinary,
} from "./rootless-port-forward-binary";
import {
    HOST_SIDE_SERVICE_PORTS,
    RootlessPortForwardError,
    assertForwardSpecsSafe,
    defaultGuestForwardSpecs,
} from "./rootless-port-forward-definition";

describe("forward definitions", () => {
    test("defines guest API and RDP TCP plus UDP without host-side service ports", () => {
        const specs = defaultGuestForwardSpecs("172.30.0.2");
        expect(specs).toContainEqual({
            proto: "tcp",
            listenPort: GUEST_API_PORT,
            dialHost: "172.30.0.2",
            dialPort: GUEST_API_PORT,
        });
        expect(specs).toContainEqual({
            proto: "udp",
            listenPort: GUEST_RDP_PORT,
            dialHost: "172.30.0.2",
            dialPort: GUEST_RDP_PORT,
        });
        expect(specs.every(spec => !HOST_SIDE_SERVICE_PORTS.has(spec.listenPort))).toBe(true);
    });

    test("rejects host-side noVNC and QMP ports", () => {
        for (const listenPort of [8006, 7149]) {
            expect(() =>
                assertForwardSpecsSafe([{ proto: "tcp", listenPort, dialHost: "172.30.0.2", dialPort: listenPort }]),
            ).toThrow(String(listenPort));
        }
    });
});

describe("forward binary resolution", () => {
    test("maps supported Node architectures and rejects unsupported ones", () => {
        expect(goArchFromNodeArch("arm64")).toBe("arm64");
        expect(goArchFromNodeArch("x64")).toBe("amd64");
        try {
            goArchFromNodeArch("riscv64");
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(RootlessPortForwardError);
            if (error instanceof RootlessPortForwardError) expect(error.code).toBe("unsupported_arch");
        }
    });

    test("prefers packaged, then development, then data-dir binary", () => {
        const candidates = candidateGuestPortForwardPaths("arm64", {
            cwd: "/repo",
            resourcesPath: "/app/resources",
            winboatDir: "/data",
        });
        expect(candidates).toEqual([
            path.join("/app/resources", "guest-port-forward", "guest-port-forward-linux-arm64"),
            path.join("/repo", "tools", "guest-port-forward", "dist", "guest-port-forward-linux-arm64"),
            path.join("/data", "bin", "guest-port-forward-linux-arm64"),
        ]);
        expect(
            resolveGuestPortForwardBinary("arm64", {
                cwd: "/repo",
                resourcesPath: "/app/resources",
                winboatDir: "/data",
                existsSync: path => path === candidates[1],
            }),
        ).toBe(candidates[1]);
    });

    test("matches electron-builder packaged resource layout", () => {
        const resource = electronBuilder.extraResources.find(entry => entry.to === "guest-port-forward");
        expect(resource?.from).toContain("tools/guest-port-forward/dist");
        expect(resource?.filter).toContain("guest-port-forward-linux-arm64");
        expect(resource?.filter).toContain("guest-port-forward-linux-amd64");
    });
});
