import { describe, expect, test } from "bun:test";
import type { ComposeConfig } from "../../../types";
import type { ContainerManager } from "./container";
import { mutateAfterComposePreflight, recreateContainerAfterPreflight } from "./container-mutation-boundary";

function managerWithCalls(calls: string[], failPreflight: boolean): ContainerManager {
    return {
        preflight: async () => {
            calls.push("preflight");
            if (failPreflight) throw new Error("invalid architecture");
        },
        remove: async () => {
            calls.push("remove");
        },
        compose: async direction => {
            calls.push(`compose:${direction}`);
        },
    } as ContainerManager;
}

describe("container mutation boundary", () => {
    test("stale recreation performs no mutation when preflight fails", async () => {
        const calls: string[] = [];

        await expect(recreateContainerAfterPreflight(managerWithCalls(calls, true))).rejects.toThrow(
            "invalid architecture",
        );
        expect(calls).toEqual(["preflight"]);
    });

    test("stale recreation preserves preflight, remove, compose order", async () => {
        const calls: string[] = [];

        await recreateContainerAfterPreflight(managerWithCalls(calls, false));
        expect(calls).toEqual(["preflight", "remove", "compose:up"]);
    });

    test("compose replacement callback is unreachable when incoming preflight fails", async () => {
        const calls: string[] = [];
        const manager = managerWithCalls(calls, true);

        await expect(
            mutateAfterComposePreflight(manager, {} as ComposeConfig, async () => {
                calls.push("stop-down-write-up");
            }),
        ).rejects.toThrow("invalid architecture");
        expect(calls).toEqual(["preflight"]);
    });
});
