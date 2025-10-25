import { type ComposeConfig } from "../../types";
import { GUEST_RDP_PORT, PORT_MAX, PORT_SEARCH_RANGE, PORT_SPACING, WINBOAT_DIR } from "../lib/constants";
import { createLogger } from "./log";
import path from "path";
const { createServer }: typeof import("net") = require("node:net");

const logger = createLogger(path.join(WINBOAT_DIR, "ports.log"));

// Here, undefined denotes the absence of a protocol from the port entry.
type PortEntryProtocol = "tcp" | "udp" | undefined;

type PortManagerConfig = {
    findOpenPorts: boolean;
};

type PortMappingOptions = PortManagerConfig & {
    protocol?: PortEntryProtocol;
};

export class ComposePortEntry extends String {
    hostPort: number;
    guestPort: number;
    protocol: PortEntryProtocol = undefined;

    constructor(entry: string) {
        super(entry);

        // Compose port entries map a host port to a guest port in the following format: <hostport>:<guestport>/<protocol(can be omitted)>
        // To parse out the host and guest ports, we first split the entry up using ":" as a separator. Now we can parse the host port just fine.
        // To parse the guest port as well, we need to remove the optional protocol from the entry. To do this, we map over our substrings, and split by "/".
        const portEntry = entry.split(":").map(x => x.split("/")[0]);

        this.hostPort = Number.parseInt(portEntry[0]);
        this.guestPort = Number.parseInt(portEntry[1]);
        this.protocol = ComposePortEntry.parseProtocol(entry);
    }

    // TODO: change how ComposePortEntry is initialized
    static fromPorts(hostPort: number, guestPort: number, protocol?: PortEntryProtocol) {
        const protocolString = protocol ? `/${protocol}` : "";
        return new ComposePortEntry(`${hostPort}:${guestPort}${protocolString}`);
    }

    get entry() {
        const delimeter = this.protocol ? "/" : "";

        return `${this.hostPort}:${this.guestPort}${delimeter}${this.protocol ?? ""}`;
    }

    static parseProtocol(entry: string): PortEntryProtocol {
        const protocol = entry.split("/").at(1) as Exclude<undefined, PortEntryProtocol>;
        const isProtocolSpecified = ["tcp", "udp"].includes(protocol);

        return isProtocolSpecified ? protocol : undefined;
    }
}

export class PortManager {
    private readonly ports: Map<number, ComposePortEntry>;

    /**
     * Please use {@link parseCompose} instead to initialize a `PortManager` from a `ComposeConfig` object
     */
    constructor() {
        this.ports = new Map();
    }

    /**
     * Parses port entries in a {@link ComposeConfig} object, checking if the host ports specified are open.
     *
     * In case they aren't, it checks the followig 100 port entries and uses the first open port found.
     *
     * @param compose The config to be parsed
     * @returns A {@link PortManager} object
     */
    static async parseCompose(
        compose: ComposeConfig,
        options: PortManagerConfig = { findOpenPorts: true },
    ): Promise<PortManager> {
        const portManager = new PortManager();
        const rawConfigPortEntries = compose.services.windows.ports;
        const parsedConfigPortEntries = compose.services.windows.ports.map(rawEntry => new ComposePortEntry(rawEntry));
        let rdpHostPort = GUEST_RDP_PORT; // by default we map the rdp host port to the same value as in the guest, so it's a great default value.

        // Parse port entries and populate the ports map, skipping over the RDP entries.
        // TODO: check for duplicates
        for (const portEntry of parsedConfigPortEntries) {
            // Avoid overlapping port lookups
            if (
                portManager.ports
                    .values()
                    .some(entry => PortManager.getPortDistance(entry.hostPort, portEntry.hostPort) <= PORT_SEARCH_RANGE)
            ) {
                portEntry.hostPort += PORT_SPACING;
            }

            if (portEntry.guestPort === GUEST_RDP_PORT) {
                rdpHostPort = portEntry.hostPort;
                continue;
            }

            await portManager.setPortMapping(portEntry.guestPort, portEntry.hostPort, { ...options });
        }

        // Handle the RDP entries separately since those are duplicates.
        await portManager.setPortMapping(GUEST_RDP_PORT, rdpHostPort, { ...options });

        return portManager;
    }

    /**
     * Returns the host port that's mapped to given guest port.
     *
     * If the guest port is not found in this port manager, then it's value is returned.
     */
    getHostPort(guestPort: number | string): number {
        if (typeof guestPort === "string") {
            guestPort = Number.parseInt(guestPort);
        }

        const portEntry = this.ports.get(guestPort);
        return portEntry?.hostPort ?? guestPort;
    }

    /**
     * Creates a new port mapping or overwrites an existing one.
     * In case the host port is not open, it tries to find one.
     */
    async setPortMapping(
        guestPort: number | string,
        hostPort: number | string,
        options: PortMappingOptions = { findOpenPorts: true },
    ) {
        if (typeof guestPort === "string") {
            guestPort = Number.parseInt(guestPort);
        }
        if (typeof hostPort === "string") {
            hostPort = Number.parseInt(hostPort);
        }

        if (!(await PortManager.isPortOpen(hostPort)) && options?.findOpenPorts) {
            const randomOpenPort = await PortManager.getOpenPortInRange(hostPort + 1, hostPort + PORT_SEARCH_RANGE);

            if (!randomOpenPort) {
                logger.error(`No open port found in range ${hostPort}:${hostPort + PORT_SEARCH_RANGE}`); // TODO: handle this case with a dialog possibly
                throw new Error(`No open port found in range ${hostPort}:${hostPort + PORT_SEARCH_RANGE}`);
            }

            logger.info(`Port ${hostPort} is in use, remapping to ${randomOpenPort}`);
            hostPort = randomOpenPort;
        }

        this.ports.set(guestPort, ComposePortEntry.fromPorts(hostPort, guestPort, options?.protocol));
    }

    /**
     * Returns whether there's a port mapping tied to given guestPort
     */
    hasPortMapping(guestPort: string | number): boolean {
        if (typeof guestPort === "string") {
            guestPort = Number.parseInt(guestPort);
        }

        return this.ports.has(guestPort);
    }

    /**
     * Returns port entries in a string array using {@link ComposeConfig}'s format
     */
    get composeFormat(): string[] {
        const ret = [];

        for (const [_, portEntry] of this.ports.entries()) {
            if (portEntry.guestPort !== GUEST_RDP_PORT) {
                ret.push(portEntry.entry);
                continue;
            }

            portEntry.protocol = "tcp";
            ret.push(portEntry.entry);

            portEntry.protocol = "udp";
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

    /**
     * Returns the next open port starting from `minPort`, scanning up to `maxPort`
     *
     * @param minPort The port from which we start testing for open ports
     * @param maxPort The maximum port bound we test for
     * @returns The first open port encountered
     */
    static async getOpenPortInRange(
        minPort: number | string,
        maxPort: number | string = PORT_MAX,
    ): Promise<number | undefined> {
        if (typeof maxPort === "string") {
            maxPort = Number.parseInt(maxPort);
        }

        if (typeof minPort === "string") {
            minPort = Number.parseInt(minPort);
        }

        for (let i = 0; i <= maxPort; i++) {
            if (!(await PortManager.isPortOpen(minPort + i))) continue;
            return minPort + i;
        }
    }

    /**
     * Returns the host port that maps to the given guest port in the given compose object
     *
     * @param guestPort The port that gets looked up
     * @param compose The compose object we search in
     * @returns The host port that maps to the given guest port, or null if not found
     */
    static getHostPortFromCompose(guestPort: number | string, compose: ComposeConfig): number | null {
        const res = compose.services.windows.ports.find(x => x.split(":")[1].includes(guestPort.toString()));
        return res ? Number.parseInt(res.split(":")[0]) : null;
    }

    /**
     * Calculates the distance between two ports
     */
    static getPortDistance(port1: number, port2: number): number {
        return Math.abs(port1 - port2);
    }
}
