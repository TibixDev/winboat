import { DockerContainer, DockerSpecs } from "./docker";
import { PodmanContainer, PodmanSpecs } from "./podman";

// For convenience
export { type DockerSpecs } from "./docker";
export { type PodmanSpecs } from "./podman";

export enum ContainerRuntimes {
    DOCKER = "Docker",
    PODMAN = "Podman",
};

export const ContainerImplementations = {
    [ContainerRuntimes.DOCKER]: DockerContainer,
    [ContainerRuntimes.PODMAN]: PodmanContainer,
} as const satisfies Record<ContainerRuntimes, any>; // this makes it so ContainerImplementations has to map ContainerRuntimes to something exhaustively

type ContainerSpecs = {
    [ContainerRuntimes.DOCKER]: DockerSpecs
    [ContainerRuntimes.PODMAN]: PodmanSpecs
};

export function getContainerSpecs<T extends ContainerRuntimes>(type: T): ContainerSpecs[T] {
    return ContainerImplementations[type]._getSpecs() as ContainerSpecs[T];
}

export function createContainer<T extends ContainerRuntimes>(type: T, ...params: ConstructorParameters<typeof ContainerImplementations[T]>) {
    return new ContainerImplementations[type](...(params as []));
}