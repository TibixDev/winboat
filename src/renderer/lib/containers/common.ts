import { PortEntryProtocol } from "../../../types";
import { ComposePortEntry } from "../../utils/port";
import { GUEST_API_PORT, GUEST_NOVNC_PORT, GUEST_QMP_PORT, GUEST_RDP_PORT } from "../constants";
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

export enum CommonPorts {
    RDP = GUEST_RDP_PORT,
    NOVNC = GUEST_NOVNC_PORT,
    API = GUEST_API_PORT,
    QMP = GUEST_QMP_PORT,
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
