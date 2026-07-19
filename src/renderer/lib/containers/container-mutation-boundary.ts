import type { ComposeConfig } from "../../../types";
import type { ContainerManager } from "./container";

export async function recreateContainerAfterPreflight(manager: ContainerManager): Promise<void> {
    await manager.preflight(undefined, true);
    await manager.remove();
    await manager.compose("up");
}

export async function mutateAfterComposePreflight<T>(
    manager: ContainerManager,
    compose: ComposeConfig,
    mutation: () => Promise<T>,
): Promise<T> {
    await manager.preflight(compose);
    return mutation();
}
