import { describe, expect, test } from "bun:test";
import {
    PodmanArchitecturePreflightError,
    preflightPodmanArchitecture,
    validatePodmanComposeArchitecture,
} from "./podman-architecture-preflight";
import { compose, ExitError, scriptedExec, StringExitError } from "./podman-architecture-preflight-support.test";

describe("static Podman architecture validation", () => {
    test("returns the immutable image/platform plan when arm64 compose is compatible", () => {
        const config = compose({ image: "registry.example/windows:v1", platform: "linux/arm64" });

        const plan = validatePodmanComposeArchitecture(config, "arm64");

        expect(plan).toEqual({ image: "registry.example/windows:v1", platform: "linux/arm64" });
    });

    test("rejects a blank compose image", () => {
        const config = compose({ image: "   " });

        expect(() => validatePodmanComposeArchitecture(config, "arm64")).toThrow(
            expect.objectContaining({ code: "container_image_missing" }),
        );
    });

    test("rejects a compose platform that differs from the host", () => {
        const config = compose({ platform: "linux/amd64" });

        expect(() => validatePodmanComposeArchitecture(config, "arm64")).toThrow(
            expect.objectContaining({ code: "compose_platform_mismatch" }),
        );
    });

    test("rejects a /boot.iso mount on arm64", () => {
        const config = compose({ volumes: ["/safe/windows.iso:/boot.iso:ro"] });

        expect(() => validatePodmanComposeArchitecture(config, "arm64")).toThrow(
            expect.objectContaining({ code: "unverified_guest_arch" }),
        );
    });

    test("rejects the pinned image custom-media /custom.iso alias on arm64", () => {
        const config = compose({ volumes: ["/safe/windows.iso:/custom.iso:ro"] });

        expect(() => validatePodmanComposeArchitecture(config, "arm64")).toThrow(
            expect.objectContaining({ code: "unverified_guest_arch" }),
        );
    });

    test("rejects POSIX-equivalent custom media destinations on arm64", () => {
        for (const destination of ["/./boot.iso", "//boot.iso", "/tmp/../boot.iso", "/./custom.iso"]) {
            const config = compose({ volumes: [`/safe/windows.iso:${destination}:ro`] });

            expect(() => validatePodmanComposeArchitecture(config, "arm64")).toThrow(
                expect.objectContaining({ code: "unverified_guest_arch" }),
            );
        }
    });

    test("rejects a custom VERSION URL on arm64 without echoing it", () => {
        const config = compose({ version: "https://example.invalid/windows-x64.iso?token=do-not-log" });

        try {
            validatePodmanComposeArchitecture(config, "arm64");
            expect.unreachable("should reject a custom VERSION URL");
        } catch (error) {
            expect(error).toBeInstanceOf(PodmanArchitecturePreflightError);
            if (error instanceof PodmanArchitecturePreflightError) {
                expect(error.code).toBe("unverified_guest_arch");
                expect(String(error)).not.toContain("do-not-log");
            }
        }
    });

    test("allows every automatic Windows ARM version supported by the pinned image", () => {
        for (const version of ["11", "11l", "11e", "10", "10l", "10e"]) {
            expect(() => validatePodmanComposeArchitecture(compose({ version }), "arm64")).not.toThrow();
        }
    });

    test("rejects unknown automatic media selectors on arm64", () => {
        expect(() => validatePodmanComposeArchitecture(compose({ version: "7u" }), "arm64")).toThrow(
            expect.objectContaining({ code: "unverified_guest_arch" }),
        );
    });

    test("allows a /boot.iso mount on x64", () => {
        const config = compose({ platform: "linux/amd64", volumes: ["/safe/windows.iso:/boot.iso:ro"] });

        const plan = validatePodmanComposeArchitecture(config, "x64");

        expect(plan.platform).toBe("linux/amd64");
    });

    test("does not confuse a host source named boot.iso with the container destination", () => {
        const config = compose({ volumes: ["/boot.iso:/media/installer.iso:ro"] });

        expect(() => validatePodmanComposeArchitecture(config, "arm64")).not.toThrow();
    });

    test("does not confuse a host source named custom.iso with the container destination", () => {
        const config = compose({ volumes: ["/custom.iso:/media/installer.iso:ro"] });

        expect(() => validatePodmanComposeArchitecture(config, "arm64")).not.toThrow();
    });
});

describe("behavioral Podman architecture preflight", () => {
    test("inspects an existing image without pulling", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec(
            [
                { kind: "stdout", stdout: "" },
                { kind: "stdout", stdout: "arm64\n" },
            ],
            calls,
        );

        const plan = await preflightPodmanArchitecture(compose(), "arm64", exec);

        expect(plan.platform).toBe("linux/arm64");
        expect(calls).toEqual([
            ["image", "exists", "registry.example/windows:arm"],
            ["image", "inspect", "--format={{.Architecture}}", "registry.example/windows:arm"],
        ]);
    });

    test("pulls only after image-exists exits exactly one, then verifies architecture", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec(
            [
                { kind: "error", error: new ExitError(1) },
                { kind: "stdout", stdout: "pulled" },
                { kind: "stdout", stdout: "aarch64\n" },
            ],
            calls,
        );

        await preflightPodmanArchitecture(compose(), "arm64", exec);

        expect(calls).toEqual([
            ["image", "exists", "registry.example/windows:arm"],
            ["pull", "--platform", "linux/arm64", "registry.example/windows:arm"],
            ["image", "inspect", "--format={{.Architecture}}", "registry.example/windows:arm"],
        ]);
    });

    test("does not pull when image-exists exits two", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec([{ kind: "error", error: new ExitError(2) }], calls);

        const rejection = preflightPodmanArchitecture(compose(), "arm64", exec);

        await expect(rejection).rejects.toMatchObject({
            name: "PodmanArchitecturePreflightError",
            code: "image_exists_failed",
        });
        expect(calls).toEqual([["image", "exists", "registry.example/windows:arm"]]);
    });

    test("does not pull when image-exists fails without an exit code", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec([{ kind: "error", error: new Error("podman unavailable") }], calls);

        const rejection = preflightPodmanArchitecture(compose(), "arm64", exec);

        await expect(rejection).rejects.toBeInstanceOf(PodmanArchitecturePreflightError);
        expect(calls).toHaveLength(1);
    });

    test("does not treat the string exit code one as a missing image", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec([{ kind: "error", error: new StringExitError("1") }], calls);

        const rejection = preflightPodmanArchitecture(compose(), "arm64", exec);

        await expect(rejection).rejects.toMatchObject({ code: "image_exists_failed" });
        expect(calls).toEqual([["image", "exists", "registry.example/windows:arm"]]);
    });

    test("does not pull when inspect of an existing image fails", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec(
            [
                { kind: "stdout", stdout: "" },
                { kind: "error", error: new ExitError(125) },
            ],
            calls,
        );

        const rejection = preflightPodmanArchitecture(compose(), "arm64", exec);

        await expect(rejection).rejects.toMatchObject({ code: "image_inspect_failed" });
        expect(calls).toEqual([
            ["image", "exists", "registry.example/windows:arm"],
            ["image", "inspect", "--format={{.Architecture}}", "registry.example/windows:arm"],
        ]);
    });

    test("does not inspect when pull fails", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec(
            [
                { kind: "error", error: new ExitError(1) },
                { kind: "error", error: new ExitError(125) },
            ],
            calls,
        );

        const rejection = preflightPodmanArchitecture(compose(), "arm64", exec);

        await expect(rejection).rejects.toMatchObject({ code: "image_pull_failed" });
        expect(calls).toHaveLength(2);
    });

    test("rejects a wrong architecture after a successful pull", async () => {
        const calls: string[][] = [];
        const exec = scriptedExec(
            [
                { kind: "error", error: new ExitError(1) },
                { kind: "stdout", stdout: "pulled" },
                { kind: "stdout", stdout: "amd64\n" },
            ],
            calls,
        );

        await expect(preflightPodmanArchitecture(compose(), "arm64", exec)).rejects.toMatchObject({
            code: "container_arch_mismatch",
        });
    });
});
