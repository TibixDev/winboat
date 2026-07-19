import type { ComposeConfig } from "../../../types";
import { PODMAN_DEFAULT_COMPOSE } from "../../data/podman";
import type { PodmanExec } from "./podman-architecture-preflight";

type ComposeOverrides = {
    readonly image?: string;
    readonly platform?: "linux/arm64" | "linux/amd64";
    readonly volumes?: readonly string[];
    readonly version?: string;
};

export type ExecOutcome =
    | { readonly kind: "stdout"; readonly stdout: string }
    | { readonly kind: "error"; readonly error: Error };

export class ExitError extends Error {
    constructor(readonly code: number) {
        super(`exit ${code}`);
    }
}

export class StringExitError extends Error {
    constructor(readonly code: string) {
        super(`exit ${code}`);
    }
}

class TestFixtureError extends Error {
    readonly name = "TestFixtureError";
}

export function compose(overrides: ComposeOverrides = {}): ComposeConfig {
    const config: ComposeConfig = {
        ...PODMAN_DEFAULT_COMPOSE,
        services: {
            windows: {
                ...PODMAN_DEFAULT_COMPOSE.services.windows,
                environment: { ...PODMAN_DEFAULT_COMPOSE.services.windows.environment },
                image: overrides.image ?? "registry.example/windows:arm",
                platform: overrides.platform ?? "linux/arm64",
                volumes: [...(overrides.volumes ?? PODMAN_DEFAULT_COMPOSE.services.windows.volumes)],
            },
        },
    };
    if (overrides.version !== undefined) {
        Reflect.set(config.services.windows.environment, "VERSION", overrides.version);
    }
    return config;
}

export function scriptedExec(outcomes: ExecOutcome[], calls: string[][]): PodmanExec {
    return async args => {
        calls.push([...args]);
        const outcome = outcomes.shift();
        if (outcome === undefined) throw new TestFixtureError("unexpected exec call");
        if (outcome.kind === "error") throw outcome.error;
        return outcome.stdout;
    };
}
