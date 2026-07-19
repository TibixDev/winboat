const tailByContainer = new Map<string, Promise<void>>();

export async function runContainerForwardEnsureSerialized<Result>(
    containerName: string,
    operation: () => Promise<Result>,
): Promise<Result> {
    const previous = tailByContainer.get(containerName) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
        release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => gate);
    tailByContainer.set(containerName, tail);

    await previous.catch(() => undefined);
    try {
        return await operation();
    } finally {
        release();
        if (tailByContainer.get(containerName) === tail) tailByContainer.delete(containerName);
    }
}
