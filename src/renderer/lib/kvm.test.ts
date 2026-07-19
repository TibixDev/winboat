import { describe, expect, test } from "bun:test";
import { evaluateKvmEnabled, probeKvmDeviceAccess, type KvmProbeDeps } from "./kvm";

describe("evaluateKvmEnabled", () => {
    test("enables when device exists and O_RDWR open succeeded", () => {
        expect(
            evaluateKvmEnabled({
                kvmDeviceExists: true,
                canOpenRdwr: true,
            }),
        ).toBe(true);
    });

    test("disables when device is missing", () => {
        expect(
            evaluateKvmEnabled({
                kvmDeviceExists: false,
                canOpenRdwr: false,
            }),
        ).toBe(false);
    });

    test("disables when device exists but O_RDWR open failed", () => {
        expect(
            evaluateKvmEnabled({
                kvmDeviceExists: true,
                canOpenRdwr: false,
            }),
        ).toBe(false);
    });
});

describe("probeKvmDeviceAccess (injectable pure boundary)", () => {
    const O_RDWR = 0x2;

    test("exists + open success => canOpenRdwr true", () => {
        const opens: number[] = [];
        const deps: KvmProbeDeps = {
            devicePath: "/dev/kvm",
            oRdwr: O_RDWR,
            existsSync: () => true,
            openSync: (_p, flags) => {
                opens.push(flags);
                return 42;
            },
            closeSync: () => {},
        };
        const probe = probeKvmDeviceAccess(deps);
        expect(probe).toEqual({ kvmDeviceExists: true, canOpenRdwr: true });
        expect(opens).toEqual([O_RDWR]);
    });

    test("missing device => canOpenRdwr false, never open", () => {
        let opened = false;
        const probe = probeKvmDeviceAccess({
            existsSync: () => false,
            openSync: () => {
                opened = true;
                return 1;
            },
            closeSync: () => {},
        });
        expect(probe).toEqual({ kvmDeviceExists: false, canOpenRdwr: false });
        expect(opened).toBe(false);
    });

    test("open failure => exists true, canOpenRdwr false", () => {
        const probe = probeKvmDeviceAccess({
            existsSync: () => true,
            openSync: () => {
                throw new Error("EACCES");
            },
            closeSync: () => {
                throw new Error("should not close");
            },
        });
        expect(probe).toEqual({ kvmDeviceExists: true, canOpenRdwr: false });
    });

    test("close is always called after successful open (finally)", () => {
        const closed: number[] = [];
        const probe = probeKvmDeviceAccess({
            existsSync: () => true,
            openSync: () => 99,
            closeSync: fd => {
                closed.push(fd);
            },
            oRdwr: O_RDWR,
        });
        expect(probe.canOpenRdwr).toBe(true);
        expect(closed).toEqual([99]);
    });

    test("close is not required path when open throws", () => {
        let closeCount = 0;
        probeKvmDeviceAccess({
            existsSync: () => true,
            openSync: () => {
                throw Object.assign(new Error("EPERM"), { code: "EPERM" });
            },
            closeSync: () => {
                closeCount++;
            },
        });
        expect(closeCount).toBe(0);
    });

    test("close failure is surfaced", () => {
        expect(() =>
            probeKvmDeviceAccess({
                existsSync: () => true,
                openSync: () => 17,
                closeSync: () => {
                    throw new Error("close failed");
                },
            }),
        ).toThrow("close failed");
    });
});
