import { GUEST_API_PORT, GUEST_RDP_PORT } from "../constants";

export const GUEST_FORWARDER_CONTAINER_PATH = "/usr/local/bin/guest-port-forward-winboat-gpf-v1";

export const LEGACY_FORWARDER_CONTAINER_PATHS = [
    "/usr/local/bin/guest-port-forward",
    "/tmp/winboat-tcp-forward",
] as const;

export type GuestForwardSpec = {
    readonly proto: "tcp" | "udp";
    readonly listenPort: number;
    readonly dialHost: string;
    readonly dialPort: number;
};

export type PodmanExecResult = {
    readonly stdout: string;
    readonly stderr: string;
};

export type PodmanRunner = {
    readonly exec: (args: readonly string[]) => Promise<PodmanExecResult>;
};

export type ForwarderProcessKind = "product" | "legacy" | "any";

export type EnsureForwardOptions = {
    readonly containerName: string;
    readonly binaryHostPath?: string;
    readonly specs?: readonly GuestForwardSpec[];
    readonly guestIP?: string;
    readonly replaceExisting?: boolean;
    readonly fatalOnError?: boolean;
    readonly runner?: PodmanRunner;
    readonly sleepMs?: (ms: number) => Promise<void>;
    readonly existsSync?: (path: string) => boolean;
};

export type EnsureForwardResult = {
    readonly started: readonly string[];
    readonly skipped: readonly string[];
    readonly stopped: readonly number[];
};

export class RootlessPortForwardError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "RootlessPortForwardError";
        this.code = code;
    }
}

export function defaultGuestForwardSpecs(guestIP = "172.30.0.2"): readonly GuestForwardSpec[] {
    return [
        { proto: "tcp", listenPort: GUEST_API_PORT, dialHost: guestIP, dialPort: GUEST_API_PORT },
        { proto: "tcp", listenPort: GUEST_RDP_PORT, dialHost: guestIP, dialPort: GUEST_RDP_PORT },
        { proto: "udp", listenPort: GUEST_RDP_PORT, dialHost: guestIP, dialPort: GUEST_RDP_PORT },
    ];
}

export const HOST_SIDE_SERVICE_PORTS = new Set([5900, 8006, 7149]);

export function assertForwardSpecsSafe(specs: readonly GuestForwardSpec[]): void {
    for (const spec of specs) {
        if (HOST_SIDE_SERVICE_PORTS.has(spec.listenPort)) {
            throw new RootlessPortForwardError(
                "unsafe_port",
                `refusing to forward host-side service port ${spec.listenPort} (noVNC/QMP/VNC)`,
            );
        }
    }
}
