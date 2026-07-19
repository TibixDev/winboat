import { describe, expect, test } from "bun:test";
import {
    GUEST_FORWARDER_CONTAINER_PATH,
    defaultGuestForwardSpecs,
} from "./rootless-port-forward-definition";
import {
    hasUnexpectedOwnedForwarderProcess,
    parseForwarderPidsFromPs,
    specsNeedingStart,
    stopGuestPortForwarders,
    verifyForwardersRunning,
} from "./rootless-port-forward-process";
import { FakePodmanRunner, allProductProcesses, productProcess } from "./rootless-port-forward.test-support";

const specs = defaultGuestForwardSpecs();

describe("exact forwarder process ownership", () => {
    test("accepts only the exact current argv[0] as healthy", () => {
        const listing = allProductProcesses(specs)
            .map(process => `${process.pid} ${process.argv.join(" ")}`)
            .join("\n");
        expect(specsNeedingStart(specs, listing)).toHaveLength(0);
    });

    test("does not trust a same-basename executable under tmp", () => {
        const foreign = productProcess(10, specs[0], `/tmp/${GUEST_FORWARDER_CONTAINER_PATH.split("/").at(-1)}`);
        const listing = `${foreign.pid} ${foreign.argv.join(" ")}`;
        expect(specsNeedingStart(specs, listing)).toHaveLength(3);
        expect(parseForwarderPidsFromPs(listing, "any")).toEqual([]);
    });

    test("does not trust sleep arguments or logger text mentioning the product path", () => {
        const productArgs = productProcess(10, specs[0]).argv.join(" ");
        const listing = `10 /bin/sleep 999 ${productArgs}\n11 /usr/bin/logger stopped ${productArgs}`;
        expect(specsNeedingStart(specs, listing)).toHaveLength(3);
        expect(parseForwarderPidsFromPs(listing, "any")).toEqual([]);
    });

    test("recognizes only exact allowlisted legacy executables", () => {
        const legacyProduct = productProcess(10, specs[0], "/usr/local/bin/guest-port-forward");
        const legacyTcp = `11 /tmp/winboat-tcp-forward 0.0.0.0:3389 172.30.0.2:3389`;
        const foreignTcp = `12 /opt/winboat-tcp-forward 0.0.0.0:7148 172.30.0.2:7148`;
        const listing = `${legacyProduct.pid} ${legacyProduct.argv.join(" ")}\n${legacyTcp}\n${foreignTcp}`;
        expect(parseForwarderPidsFromPs(listing, "legacy")).toEqual([10, 11]);
        expect(specsNeedingStart(specs, listing, { honorLegacy: true })).toHaveLength(1);
    });

    test("marks an exact-owned wrong endpoint unexpected but ignores foreign mentions", () => {
        const wrong = `10 ${GUEST_FORWARDER_CONTAINER_PATH} -proto tcp -listen 0.0.0.0:7148 -dial 203.0.113.1:9`;
        const foreign = `11 /bin/sleep 9 ${GUEST_FORWARDER_CONTAINER_PATH}`;
        expect(hasUnexpectedOwnedForwarderProcess(wrong, specs)).toBe(true);
        expect(hasUnexpectedOwnedForwarderProcess(foreign, specs)).toBe(false);
    });

    test("does not let TCP presence hide a missing UDP listener", () => {
        const tcpOnly = allProductProcesses(specs.filter(spec => spec.proto === "tcp"))
            .map(process => `${process.pid} ${process.argv.join(" ")}`)
            .join("\n");
        expect(specsNeedingStart(specs, tcpOnly)).toEqual([specs[2]]);
    });

    test("rejects unversioned and wrong-dial product-shaped commands", () => {
        const unversioned = productProcess(10, specs[0], "/opt/guest-port-forward");
        const wrongDial = `11 ${GUEST_FORWARDER_CONTAINER_PATH} -proto tcp -listen 0.0.0.0:3389 -dial 198.51.100.1:9`;
        const listing = `${unversioned.pid} ${unversioned.argv.join(" ")}\n${wrongDial}`;
        expect(specsNeedingStart(specs, listing)).toHaveLength(3);
    });
});

describe("owned process operations", () => {
    test("kills exact-owned processes without touching foreign same-name processes", async () => {
        const current = productProcess(10, specs[0]);
        const foreign = productProcess(11, specs[1], `/tmp/${GUEST_FORWARDER_CONTAINER_PATH.split("/").at(-1)}`);
        const runner = new FakePodmanRunner({ processes: [current, foreign] });
        expect(await stopGuestPortForwarders("WinBoat", "any", runner)).toEqual([10]);
        expect(runner.processes.has(10)).toBe(false);
        expect(runner.processes.has(11)).toBe(true);
    });

    test("verifies all required protocol and endpoint tuples", () => {
        const incomplete = allProductProcesses(specs.slice(0, 2))
            .map(process => `${process.pid} ${process.argv.join(" ")}`)
            .join("\n");
        expect(() => verifyForwardersRunning(specs, incomplete)).toThrow();
    });
});
