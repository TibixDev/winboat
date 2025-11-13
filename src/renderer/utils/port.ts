import { type ComposeConfig, LongPortMapping, type PortEntryProtocol } from "../../types";

const { createServer, isIPv4, isIPv6 }: typeof import("net") = require("node:net");

enum PortType {
    HOST = "Host",
    CONTAINER = "Container",
}

type Port = number;

type PortEntryOptions = {
    hostIP?: string;
    protocol: PortEntryProtocol;
};

export class Range {
    start: number;
    end: number;

    /**
     * Instantiates a {@link Range} from the compose string representation.
     *
     * @param token Format: `<start>-<end>`
     */
    constructor(token: string);

    /**
     * Instantiates a {@link Range} from numerical `start` and `end` values
     *
     * @param start Start of the Range
     * @param end End of the Range
     */
    constructor(start: number, end: number);
    constructor(_tokenOrStart: number | string, _end?: number) {
        if (typeof _tokenOrStart === "number") {
            if (!_end) throw new Error("Invalid constructor call");

            this.start = _tokenOrStart;
            this.end = _end;
            return;
        }

        const splitToken = _tokenOrStart.split("-");

        this.start = parseInt(splitToken[0]);
        this.end = parseInt(splitToken[1]);
    }

    toString(): string {
        return `${this.start}-${this.end}`;
    }

    /**
     * Checks whether the supplied value is a {@link Range}.
     */
    static isRange(value: Port | Range): boolean {
        if (typeof value === "number") return false;

        return "start" in value && "end" in value;
    }
}

export class ComposePortEntry {
    static readonly defaultOptions = {
        hostIP: "0.0.0.0",
        protocol: "tcp",
    };

    hostIP: string;
    host: Port | Range;
    container: Port | Range;
    protocol: PortEntryProtocol;

    /**
     * Parses a short form Compose Port mapping according to the [Compose Specification](https://github.com/compose-spec/compose-spec/blob/main/spec.md#ports).
     *
     * @param entry Format: `[HOST:]CONTAINER[/PROTOCOL]`
     */
    constructor(entry: string);
    constructor(hostPort: number, guestPort: number, options?: PortEntryOptions);
    constructor(_entryOrHostPort: string | number, _guestPort?: number, _options?: PortEntryOptions) {
        if (typeof _entryOrHostPort === "number") {
            if (!_guestPort || !_options) throw new Error("Invalid constructor call");

            this.hostIP = _options.hostIP ?? ComposePortEntry.defaultOptions.hostIP;
            this.protocol = _options.protocol ?? ComposePortEntry.defaultOptions.protocol;
            this.host = _entryOrHostPort;
            this.container = _guestPort;
            return;
        }

        this.hostIP = ComposePortEntry.parseIP(_entryOrHostPort);
        this.host = ComposePortEntry.parsePort(PortType.HOST, _entryOrHostPort);
        this.container = ComposePortEntry.parsePort(PortType.CONTAINER, _entryOrHostPort);
        this.protocol = ComposePortEntry.parseProtocol(_entryOrHostPort);
    }

    /**
     * Converts the {@link ComposePortEntry} into a valid compose string representation
     *
     * @note If it was initialized from a compose port entry with implicit default values, then those will be included explicitly (e.g. `/tcp` or `0.0.0.0` binding)
     */
    get entry(): string {
        const host = Number.isNaN(this.host) ? "" : this.host; // This accounts for podman's empty host (see: podman publish syntax)
        return `${this.hostIP}:${host}:${this.container}/${this.protocol}`;
    }

    static parseProtocol(entry: string): PortEntryProtocol {
        const protocol = entry.split("/").at(1);

        if (!protocol) return "tcp"; // TCP is the default protocol if one isn't specified per the compose spec
        if (protocol === "tcp" || protocol === "udp") {
            return protocol;
        }

        throw new Error(`Protocol '${protocol}' is not supported by the compose spec.`);
    }

    /**
     * Parses a `(port | range)` token specified by the compose spec.
     */
    private static parsePortOrRange(token: string): Port | Range {
        if (token.includes("-")) return new Range(token);

        return parseInt(token);
    }

    /**
     * Parses the part of the compose mapping specified by `type`, as defined by the compose spec.
     *
     * @note Implicit default values are respected
     *
     * @example ComposePortEntry.parsePort(PortType.HOST, "8080"); // returns 8080
     */
    static parsePort(type: PortType, entry: string): Port | Range {
        const portEntry = entry.split(":");
        const guest = portEntry.at(-1)!.split("/")[0];

        if (portEntry.length == 1) return ComposePortEntry.parsePortOrRange(guest);

        if (type == PortType.HOST) {
            const host = portEntry.at(-2)!;

            return ComposePortEntry.parsePortOrRange(host);
        }

        return ComposePortEntry.parsePortOrRange(guest);
    }

    private static checkValidIP(ip: string, entry: string): string {
        if (!isIPv4(ip) && !isIPv6(ip)) throw new Error(`Invalid compose entry: ${entry}, IP: ${ip}`);
        return ip;
    }

    /**
     * Parses the optional IP part of the port mapping, as defined by the compose spec.
     *
     * @note Implicit default values are respected
     *
     * @example ComposePortEntry.parseIP("69:4200"); // returns "0.0.0.0"
     */
    static parseIP(entry: string): string {
        const parts = entry.split(":");

        // As per the compose spec, there must be at least 2 colons in the entry for an IP to be specified
        if (parts.length < 3) return "0.0.0.0";

        // Extra logic for allowing empty host port, needed for supporting podman's publish syntax
        let lastPort = parts.at(-2)!;
        let colonNum = 1;

        if (lastPort.length === 0) {
            lastPort = parts.at(-1)!;
            colonNum = 2;
        }

        // Here we find the index where the host ip ends (removing one makes sure we remove the colon as well)
        const hostPortLocation = entry.indexOf(lastPort) - colonNum;
        const rawIP = entry.substring(0, hostPortLocation);

        // In case the IP isn't enclosed with square brackets, we don't need any further processing
        if (!rawIP[0].startsWith("[")) return ComposePortEntry.checkValidIP(rawIP, entry);

        const IP = rawIP.substring(1, rawIP.length - 1);

        return ComposePortEntry.checkValidIP(IP, entry);
    }
}

export class ComposePortMapper {
    private readonly shortPorts: ComposePortEntry[];
    private readonly longPorts: LongPortMapping[];

    /**
     * Parses port entries in a {@link ComposeConfig} object.
     *
     * @param compose The config to be parsed
     * @returns A {@link ComposePortMapper} object
     */
    constructor(compose: ComposeConfig) {
        this.shortPorts = [];
        this.longPorts = [];

        for (const composeMapping of compose.services.windows.ports) {
            this.pushPortEntry(composeMapping);
        }
    }

    /**
     * **WARNING**: Could introduce dupliate entries, use carefully!
     *
     * Pushes a port entry to the internal port array.
     */
    private pushPortEntry(entry: string | LongPortMapping) {
        if (typeof entry === "string") {
            this.shortPorts.push(new ComposePortEntry(entry));
            return;
        }

        this.longPorts.push(entry);
    }

    /**
     * Finds the index of the short syntax port entry with the same guest port and protocol in the internal shortPorts list
     */
    private findGuestPortIndex(guestPort: number | string, protocol: PortEntryProtocol = "tcp"): number | undefined {
        if (typeof guestPort === "string") {
            guestPort = Number.parseInt(guestPort);
        }

        // TODO: investigate whether we need to handle long syntax port entries here
        const idx = this.shortPorts.findIndex(
            entry =>
                typeof entry.container === "number" && entry.container === guestPort && entry.protocol === protocol,
        );

        return idx === -1 ? undefined : idx;
    }

    /**
     * Returns the short syntax port mapping with the same guest port and protocol, or undefined in case given mapping doesn't exist.
     */
    getShortPortMapping(guestPort: number | string, protocol: PortEntryProtocol = "tcp"): ComposePortEntry | undefined {
        const mappingIdx = this.findGuestPortIndex(guestPort, protocol);

        if (!mappingIdx) return undefined;

        return this.shortPorts[mappingIdx];
    }

    /**
     * Creates a new port mapping or overwrites an existing one.
     * In case the host port is not open, it tries to find one.
     */
    setShortPortMapping(guestPort: number | string, hostPort: number | string, options?: PortEntryOptions): void;
    setShortPortMapping(guestPort: number | string, hostRange: number | Range, options?: PortEntryOptions): void;
    setShortPortMapping(
        _guestPort: number | string,
        _host: number | string | Range,
        _options?: PortEntryOptions,
    ): void {
        if (typeof _host === "string") {
            _host = Number.parseInt(_host);
        }
        if (typeof _guestPort === "string") {
            _guestPort = Number.parseInt(_guestPort);
        }

        const insertAt = this.findGuestPortIndex(_guestPort, _options?.protocol) ?? this.shortPorts.length;

        if (!(_host instanceof Range)) {
            this.shortPorts[insertAt] = new ComposePortEntry(_host, _guestPort, _options);
            return;
        }

        // TODO: Create ComposePortEntry constructor overload for Ranges as well to avoid this
        this.shortPorts[insertAt] = new ComposePortEntry(
            `${_options?.hostIP ?? "0.0.0.0"}:${_host}:${_guestPort}/${_options?.protocol ?? "tcp"}`,
        );
    }

    /**
     * Returns whether there's a short syntax port mapping tied to given guestPort
     */
    hasShortPortMapping(guestPort: string | number, protocol: PortEntryProtocol = "tcp"): boolean {
        if (typeof guestPort === "string") {
            guestPort = Number.parseInt(guestPort);
        }

        return !!this.findGuestPortIndex(guestPort, protocol);
    }

    /**
     * Returns port entries in a string array using {@link ComposeConfig}'s format
     */
    get composeFormat(): string[] {
        const ret = [];

        // TODO!!!: handle long syntax port mappings
        for (const portEntry of this.shortPorts) {
            ret.push(portEntry.entry);
        }

        return ret;
    }

    /**
     * Checks if a port is open
     *
     * @param port The port to check
     * @returns True if the port is open, false otherwise
     */
    static async isPortOpen(port: number | string): Promise<boolean> {
        if (typeof port === "string") {
            port = Number.parseInt(port);
        }

        return new Promise((resolve, reject) => {
            const server = createServer();

            server.once("error", (err: any) => {
                if (err.code === "EADDRINUSE") {
                    resolve(false);
                }
            });

            server.once("listening", () => {
                resolve(true);
                server.close();
            });

            server.listen(port);
        });
    }
}
