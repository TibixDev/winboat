import { type AddressInfo } from "net";
import { type ComposeConfig } from "../../types";
import { PORT_MAX } from "../lib/constants";
const { createServer, connect }: typeof import("net") = require("net");

/**
 * Checks if a port is open
 * 
 * @param port The port to check
 * @returns True if the port is open, false otherwise
 */
export async function isPortOpen(port: number  | string): Promise<boolean> {
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
export async function getOpenPortInRange(minPort: number | string, maxPort: number | string = PORT_MAX) {
    if (typeof maxPort === "string") {
        maxPort = parseInt(maxPort);
    }
    
    if (typeof minPort === "string") {
        minPort = parseInt(minPort);
    }
    
    for(let i = 0; i <= maxPort; i++) {
        if(!await isPortOpen(minPort + i)) continue;
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
export function getHostPortFromCompose(guestPort: number | string, compose: ComposeConfig): number | null {
    const res = compose.services.windows.ports.find(x => x.split(":")[1].includes(guestPort.toString()));
    return res ? parseInt(res.split(":")[0]) : null;
}