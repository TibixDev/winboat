import { describe, expect, test } from "bun:test";
import {
    inspectExistingContainerIdentity,
    preflightExistingPodmanContainer,
} from "./podman-architecture-preflight";
import { ExitError, scriptedExec } from "./podman-architecture-preflight-support.test";

describe("credential-safe existing container inspection", () => {
    test("returns the actual image ID and mount destinations using narrow formats", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec(
            [
                { kind: "stdout", stdout: "sha256:actual-image\n" },
                { kind: "stdout", stdout: "/storage\n/shared\n/oem\n" },
            ],
            calls,
        );

        const identity = await inspectExistingContainerIdentity("WinBoat", exec);

        expect(identity).toEqual({
            imageId: "sha256:actual-image",
            mountDestinations: ["/storage", "/shared", "/oem"],
        });
        expect(calls).toEqual([
            ["container", "inspect", "--format={{.Image}}", "WinBoat"],
            ["container", "inspect", "--format={{range .Mounts}}{{println .Destination}}{{end}}", "WinBoat"],
        ]);
    });

    test("does not inspect mounts when image-ID inspection fails", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec([{ kind: "error", error: new ExitError(125) }], calls);

        const rejection = inspectExistingContainerIdentity("WinBoat", exec);

        await expect(rejection).rejects.toMatchObject({ code: "container_image_inspect_failed" });
        expect(calls).toHaveLength(1);
    });

    test("does not inspect mounts when the actual image ID is blank", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec([{ kind: "stdout", stdout: "  \n" }], calls);

        const rejection = inspectExistingContainerIdentity("WinBoat", exec);

        await expect(rejection).rejects.toMatchObject({ code: "container_image_id_missing" });
        expect(calls).toHaveLength(1);
    });

    test("reports mount inspection failure without a broad container dump", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec(
            [
                { kind: "stdout", stdout: "sha256:actual-image" },
                { kind: "error", error: new ExitError(125) },
            ],
            calls,
        );

        const rejection = inspectExistingContainerIdentity("WinBoat", exec);

        await expect(rejection).rejects.toMatchObject({ code: "container_mounts_inspect_failed" });
        expect(calls.flat().join(" ")).not.toMatch(/Config|Env|Source/);
    });
});

describe("existing Podman container architecture preflight", () => {
    test("rejects an unsupported host before inspecting the container", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec([], calls);

        const rejection = preflightExistingPodmanContainer("WinBoat", "riscv64", exec);

        await expect(rejection).rejects.toMatchObject({ code: "unsupported_arch" });
        expect(calls).toHaveLength(0);
    });

    test("verifies the architecture of the actual image ID", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec(
            [
                { kind: "stdout", stdout: "sha256:actual-image\n" },
                { kind: "stdout", stdout: "/storage\n/shared\n" },
                { kind: "stdout", stdout: "11\n" },
                { kind: "stdout", stdout: "arm64\n" },
            ],
            calls,
        );

        const identity = await preflightExistingPodmanContainer("WinBoat", "arm64", exec);

        expect(identity.imageId).toBe("sha256:actual-image");
        expect(calls).toEqual([
            ["container", "inspect", "--format={{.Image}}", "WinBoat"],
            ["container", "inspect", "--format={{range .Mounts}}{{println .Destination}}{{end}}", "WinBoat"],
            expect.arrayContaining(["container", "inspect", "WinBoat"]),
            ["image", "inspect", "--format={{.Architecture}}", "sha256:actual-image"],
        ]);
        expect(calls[2]?.join(" ")).not.toMatch(/PASSWORD|USERNAME|HOME/);
    });

    test("rejects an actual image architecture that differs from the host", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec(
            [
                { kind: "stdout", stdout: "sha256:actual-image" },
                { kind: "stdout", stdout: "/storage\n" },
                { kind: "stdout", stdout: "11\n" },
                { kind: "stdout", stdout: "amd64\n" },
            ],
            calls,
        );

        const rejection = preflightExistingPodmanContainer("WinBoat", "arm64", exec);

        await expect(rejection).rejects.toMatchObject({ code: "container_arch_mismatch" });
        expect(calls.at(-1)).toEqual([
            "image",
            "inspect",
            "--format={{.Architecture}}",
            "sha256:actual-image",
        ]);
    });

    test("rejects an actual /boot.iso destination on arm64 before image inspection", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec(
            [
                { kind: "stdout", stdout: "sha256:actual-image" },
                { kind: "stdout", stdout: "/storage\n/boot.iso\n" },
            ],
            calls,
        );

        const rejection = preflightExistingPodmanContainer("WinBoat", "arm64", exec);

        await expect(rejection).rejects.toMatchObject({ code: "unverified_guest_arch" });
        expect(calls).toHaveLength(2);
    });

    test("rejects an actual /custom.iso destination on arm64 before version and image inspection", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec(
            [
                { kind: "stdout", stdout: "sha256:actual-image" },
                { kind: "stdout", stdout: "/storage\n/custom.iso\n" },
            ],
            calls,
        );

        await expect(preflightExistingPodmanContainer("WinBoat", "arm64", exec)).rejects.toMatchObject({
            code: "unverified_guest_arch",
        });
        expect(calls).toHaveLength(2);
    });

    test("rejects POSIX-equivalent existing custom media destinations before mutation", async () => {
        for (const destination of ["/./boot.iso", "//boot.iso", "/tmp/../boot.iso", "/./custom.iso"]) {
            const calls: string[][] = [];
            const exec = scriptedExec(
                [
                    { kind: "stdout", stdout: "sha256:actual-image" },
                    { kind: "stdout", stdout: `/storage\n${destination}\n` },
                ],
                calls,
            );

            await expect(preflightExistingPodmanContainer("WinBoat", "arm64", exec)).rejects.toMatchObject({
                code: "unverified_guest_arch",
            });
            expect(calls).toHaveLength(2);
        }
    });

    test("rejects an existing arm64 container whose VERSION is not on the safe allowlist", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec(
            [
                { kind: "stdout", stdout: "sha256:actual-image" },
                { kind: "stdout", stdout: "/storage\n" },
                { kind: "stdout", stdout: "" },
            ],
            calls,
        );

        await expect(preflightExistingPodmanContainer("WinBoat", "arm64", exec)).rejects.toMatchObject({
            code: "unverified_guest_arch",
        });
        expect(calls).toHaveLength(3);
        expect(calls[2]?.join(" ")).not.toMatch(/PASSWORD|USERNAME|HOME/);
    });

    test("rejects duplicate VERSION entries when one is custom without exposing its value", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec(
            [
                { kind: "stdout", stdout: "sha256:actual-image" },
                { kind: "stdout", stdout: "/storage\n" },
                { kind: "stdout", stdout: "11\n!\n" },
            ],
            calls,
        );

        await expect(preflightExistingPodmanContainer("WinBoat", "arm64", exec)).rejects.toMatchObject({
            code: "unverified_guest_arch",
        });
        expect(calls).toHaveLength(3);
        expect(calls[2]?.join(" ")).not.toMatch(/PASSWORD|USERNAME|HOME|https?:/);
    });

    test("fails closed when the narrow guest VERSION inspection fails", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec(
            [
                { kind: "stdout", stdout: "sha256:actual-image" },
                { kind: "stdout", stdout: "/storage\n" },
                { kind: "error", error: new ExitError(125) },
            ],
            calls,
        );

        await expect(preflightExistingPodmanContainer("WinBoat", "arm64", exec)).rejects.toMatchObject({
            code: "container_guest_version_inspect_failed",
        });
        expect(calls).toHaveLength(3);
    });

    test("allows /boot.iso on x64 and still verifies the actual image", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec(
            [
                { kind: "stdout", stdout: "sha256:actual-image" },
                { kind: "stdout", stdout: "/boot.iso\n" },
                { kind: "stdout", stdout: "amd64\n" },
            ],
            calls,
        );

        const identity = await preflightExistingPodmanContainer("WinBoat", "x64", exec);

        expect(identity.mountDestinations).toEqual(["/boot.iso"]);
        expect(calls).toHaveLength(3);
    });

    test("reports actual-image inspection failure without retrying or pulling", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec(
            [
                { kind: "stdout", stdout: "sha256:actual-image" },
                { kind: "stdout", stdout: "/storage\n" },
                { kind: "stdout", stdout: "11\n" },
                { kind: "error", error: new ExitError(125) },
            ],
            calls,
        );

        const rejection = preflightExistingPodmanContainer("WinBoat", "arm64", exec);

        await expect(rejection).rejects.toMatchObject({ code: "existing_image_inspect_failed" });
        expect(calls).toHaveLength(4);
        expect(calls.some(args => args.includes("pull"))).toBeFalse();
    });
});
