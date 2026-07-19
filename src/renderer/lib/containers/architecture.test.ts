import { describe, expect, test } from "bun:test";
import {
    ArchitectureBoundaryError,
    assertContainerImageArchitecture,
    assertGuestImagePolicy,
    composePlatformForNode,
    containerArchitectureForNode,
} from "./architecture";

describe("architecture boundary", () => {
    test("maps supported hosts to explicit compose platforms", () => {
        expect(containerArchitectureForNode("arm64")).toBe("arm64");
        expect(containerArchitectureForNode("x64")).toBe("amd64");
        expect(composePlatformForNode("arm64")).toBe("linux/arm64");
        expect(composePlatformForNode("x64")).toBe("linux/amd64");
    });

    test("rejects unsupported hosts with a stable non-success code", () => {
        expect(() => containerArchitectureForNode("riscv64")).toThrow(ArchitectureBoundaryError);
        try {
            containerArchitectureForNode("ia32");
            expect.unreachable("should reject ia32");
        } catch (error) {
            expect(error).toBeInstanceOf(ArchitectureBoundaryError);
            if (error instanceof ArchitectureBoundaryError) expect(error.code).toBe("unsupported_arch");
        }
    });

    test("rejects a wrong container image architecture before start", () => {
        expect(() => assertContainerImageArchitecture("arm64", "amd64")).toThrow(/refusing to start/);
        expect(() => assertContainerImageArchitecture("x64", "arm64")).toThrow(/refusing to start/);
        expect(() => assertContainerImageArchitecture("arm64", "aarch64")).not.toThrow();
    });

    test("rejects unverified custom Windows media on arm64", () => {
        expect(() => assertGuestImagePolicy("arm64", "/tmp/windows.iso")).toThrow(/cannot be verified/);
        expect(() => assertGuestImagePolicy("arm64")).not.toThrow();
        expect(() => assertGuestImagePolicy("x64", "/tmp/windows.iso")).not.toThrow();
    });
});
