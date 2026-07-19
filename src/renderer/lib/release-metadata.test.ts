import { describe, expect, test } from "bun:test";
import type { Configuration } from "app-builder-lib";
import { validateConfiguration } from "app-builder-lib/out/util/config/config.js";
import { DebugLogger } from "builder-util";

import electronBuilder from "../../../electron-builder.json";
import packageJson from "../../../package.json";

describe("release metadata", () => {
    test("declares and distributes the repository license", () => {
        expect(packageJson.license).toBe("MIT");
        expect(electronBuilder.files).toContain("LICENSE");
    });

    test("uses a valid electron-builder configuration", async () => {
        await expect(
            validateConfiguration(electronBuilder as Configuration, new DebugLogger(false)),
        ).resolves.toBeUndefined();
    });
});
