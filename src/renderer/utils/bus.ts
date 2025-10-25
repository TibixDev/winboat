type Resolver<T> = (value: T) => void;

export class MessageBus {
    private readonly resolvers: Map<string, Resolver<any>>;

    constructor() {
        this.resolvers = new Map();
    }

    send<T>(channel: string, data: T): void {
        const resolver = this.resolvers.get(channel);
        if (resolver) {
            this.resolvers.delete(channel);
            resolver(data);
        }
    }

    waitFor<T>(channel: string): Promise<T> {
        return new Promise<T>(resolve => {
            this.resolvers.set(channel, resolve);
        });
    }
}
