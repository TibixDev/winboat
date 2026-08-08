import { describe, expect, it } from "bun:test";
import { isStaleContainerError } from "../src/renderer/lib/containers/container";

describe("stale container error detection", () => {
    it("recognizes an NVIDIA driver mount left behind by a driver change", () => {
        const error = {
            stderr:
                "Error response from daemon: failed to create task for container: failed to create shim task: " +
                "OCI runtime create failed: runc create failed: unable to start container process: " +
                "error during container init: failed to fulfil mount request: " +
                "open /usr/lib/libnvidia-gtk3.so.610.57.04: no such file or directory",
        };

        expect(isStaleContainerError(error)).toBe(true);
    });

    it("does not classify an unrelated runtime failure as stale", () => {
        expect(isStaleContainerError(new Error("OCI runtime create failed: permission denied"))).toBe(false);
    });
});
