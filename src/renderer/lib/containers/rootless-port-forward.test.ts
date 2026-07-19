import { describe, expect, test } from "bun:test";
import * as publicApi from "./rootless-port-forward";

describe("rootless port forward public facade", () => {
    test("keeps the established public entry point", () => {
        expect(publicApi.ensureRootlessGuestPortForwards).toBeFunction();
        expect(publicApi.stopGuestPortForwarders).toBeFunction();
        expect(publicApi.isPodmanRootless).toBeFunction();
        expect(publicApi.GUEST_FORWARDER_CONTAINER_PATH).toStartWith("/usr/local/bin/");
    });
});
