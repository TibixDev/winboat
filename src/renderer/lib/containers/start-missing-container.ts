export interface MissingContainerStartPort {
    compose(direction: "up"): Promise<void>;
    exists(): Promise<boolean>;
}

export class MissingContainerAfterComposeError extends Error {
    readonly name = "MissingContainerAfterComposeError";

    constructor() {
        super("WinBoat container does not exist after compose up");
    }
}

export async function startMissingContainer(container: MissingContainerStartPort): Promise<void> {
    await container.compose("up");
    const exists = await container.exists();
    if (!exists) throw new MissingContainerAfterComposeError();
}
