import { type ComposeConfig } from "../../types";
import { PORT_MAX, RDP_PORT, WINBOAT_DIR } from "../lib/constants";
import { createLogger } from "./log";
import path from "path";
const { createServer, connect }: typeof import("net") = require("net");

const logger = createLogger(path.join(WINBOAT_DIR, 'ports.log'));

// Here, undefined denotes the absence of a protocol from the port entry. 
type PortEntryProtocol = "tcp" | "udp" | undefined;

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

        this.hostPort = parseInt(portEntry[0])
        this.guestPort = parseInt(portEntry[1]);
        this.protocol = ComposePortEntry.parseProtocol(entry);
    }

    // TODO: change how ComposePortEntry is initialized
    static fromPorts(hostPort: number, guestPort: number, protocol: PortEntryProtocol = undefined) {
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
    private ports: Map<number, ComposePortEntry>;

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
    static async parseCompose(compose: ComposeConfig): Promise<PortManager> {
        const portManager = new PortManager();
        const configPortEntries = compose.services.windows.ports;

        // Parse port entries and populate the ports map, skipping over the RDP entries.
        // TODO: check for duplicates
        for(const portEntry of configPortEntries) {
            const parsedEntry = new ComposePortEntry(portEntry);

            if(parsedEntry.guestPort === RDP_PORT) continue;

            if(!await PortManager.isPortOpen(parsedEntry.hostPort)) {
                const randomOpenPort = await PortManager.getOpenPortInRange(parsedEntry.hostPort + 1, parsedEntry.hostPort + 101);

                if(!randomOpenPort) {
                    logger.error(`No open port found in range ${parsedEntry.hostPort}:${parsedEntry.hostPort + 101}`); // TODO: handle this case with a dialog possibly
                    throw new Error(`No open port found in range ${parsedEntry.hostPort}:${parsedEntry.hostPort + 101}`);
                }

                logger.info(`Port ${parsedEntry.hostPort} is in use, remapping to ${randomOpenPort}`);
                parsedEntry.hostPort = randomOpenPort;
            }
            portManager.ports.set(parsedEntry.guestPort, parsedEntry);
        }

        // Handle the RDP entries separately since thos are duplicates.
        if (!PortManager.isPortOpen(RDP_PORT)) {
            const randomOpenPort = await PortManager.getOpenPortInRange(RDP_PORT + 1, RDP_PORT + 101);

            if(!randomOpenPort) {
                logger.error(`No open port found in range ${RDP_PORT}:${RDP_PORT + 101}`); // TODO: handle this case with a dialog possibly
                throw new Error(`No open port found in range ${RDP_PORT}:${RDP_PORT + 101}`);
            }

            logger.info(`RDP port ${RDP_PORT} is in use, remapping to ${randomOpenPort}`);
            portManager.ports.set(randomOpenPort, ComposePortEntry.fromPorts(randomOpenPort, RDP_PORT));
        }

        return portManager
    }

    /**
     * Returns the host port that's mapped to given guest port.
     * 
     * If the guest port is not found in this port manager, then it's value is returned.
     */
    getHostPort(guestPort: number | string): number {
        if(typeof guestPort === "string") {
            guestPort = parseInt(guestPort);
        }

        const portEntry = this.ports.get(guestPort);
        return portEntry?.hostPort ?? guestPort;
    }

    /**
     * Returns port entries in a string array using {@link ComposeConfig}'s format
     */
    get composeFormat(): string[] {
        const ret = [];

        for(const [_, portEntry] of this.ports.entries()) {
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
    static async isPortOpen(port: number  | string): Promise<boolean> {
        if (typeof port === 'string') {
            port = parseInt(port);
        }
   
        return new Promise((resolve, reject) => {
            const server = createServer();

            server.once('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(false);
                }
            });

            server.once('listening', () => {
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
    static async getOpenPortInRange(minPort: number | string, maxPort: number | string = PORT_MAX): Promise<number | undefined> {
        if (typeof maxPort === "string") {
            maxPort = parseInt(maxPort);
        }
        
        if (typeof minPort === "string") {
            minPort = parseInt(minPort);
        }
        
        for(let i = 0; i <= maxPort; i++) {
            if(!await PortManager.isPortOpen(minPort + i)) continue;
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
        return res ? parseInt(res.split(":")[0]) : null;
    }
}



