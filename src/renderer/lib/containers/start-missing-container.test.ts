import { describe, expect, test } from "bun:test";
import {
    MissingContainerAfterComposeError,
    startMissingContainer,
    type MissingContainerStartPort,
} from "./start-missing-container";

function containerWithExistence(exists: boolean, calls: string[]): MissingContainerStartPort {
    return {
        compose: async direction => {
            calls.push(`compose:${direction}`);
        },
        exists: async () => {
            calls.push("exists");
            return exists;
        },
    };
}

describe("startMissingContainer", () => {
    test("throws a typed error when compose up does not create the container", async () => {
        // Given
        const calls: string[] = [];
        const container = containerWithExistence(false, calls);

        // When
        const result = startMissingContainer(container);

        // Then
        await expect(result).rejects.toBeInstanceOf(MissingContainerAfterComposeError);
        expect(calls).toEqual(["compose:up", "exists"]);
    });

    test("resolves only after compose up creates the container", async () => {
        // Given
        const calls: string[] = [];
        const container = containerWithExistence(true, calls);

        // When
        const result = startMissingContainer(container);

        // Then
        await expect(result).resolves.toBeUndefined();
        expect(calls).toEqual(["compose:up", "exists"]);
    });
});
