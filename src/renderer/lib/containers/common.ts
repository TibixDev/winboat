import { PortEntryProtocol } from "../../../types";
import { ContainerManager } from "./container";
import { DockerContainer, DockerSpecs } from "./docker";
import { PodmanContainer, PodmanSpecs } from "./podman";

// For convenience
export { type DockerSpecs } from "./docker";
export { type PodmanSpecs } from "./podman";
export { ContainerStatus } from "./container";

export enum ContainerRuntimes {
    DOCKER = "Docker",
    PODMAN = "Podman",
}

// NOTE: These are container port values, and should be used as such
export enum CommonPorts {
    RDP = 3389,
    NOVNC = 8006,
    API = 7148,
    QMP = 7149,
}

export const ContainerImplementations = {
    [ContainerRuntimes.DOCKER]: DockerContainer,
    [ContainerRuntimes.PODMAN]: PodmanContainer,
} as const satisfies Record<ContainerRuntimes, any>; // this makes it so ContainerImplementations has to map ContainerRuntimes to something exhaustively

type ContainerSpecMap = {
    [ContainerRuntimes.DOCKER]: DockerSpecs;
    [ContainerRuntimes.PODMAN]: PodmanSpecs;
};

export type ContainerSpecs = ContainerSpecMap[ContainerRuntimes];

export async function getContainerSpecs<T extends ContainerRuntimes>(type: T): Promise<ContainerSpecMap[T]> {
    return (await ContainerImplementations[type]._getSpecs()) as ContainerSpecMap[T];
}

export function createContainer<T extends ContainerRuntimes>(
    type: T,
    ...params: ConstructorParameters<(typeof ContainerImplementations)[T]>
) {
    return new ContainerImplementations[type](...(params as []));
}

export function getActiveHostPort(
    container: ContainerManager,
    port: CommonPorts,
    protocol: PortEntryProtocol = "tcp",
): number | undefined {
    return container.cachedPortMappings?.find(
        mapping => typeof mapping.container === "number" && mapping.container === port && mapping.protocol === protocol,
    )?.host as number;
}
