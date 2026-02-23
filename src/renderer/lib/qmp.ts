import { DOSBOAT_DIR } from "./constants";
import { createLogger } from "../utils/log";
const path: typeof import("path") = require("node:path");
import { type Socket } from "net";
import { assert } from "@vueuse/core";
const { createConnection }: typeof import("net") = require("node:net");

const logger = createLogger(path.join(DOSBOAT_DIR, "qmp.log"));

type QMPGreeting = {
    QMP: {
        version: {
            qemu: {
                micro: string;
                minor: string;
                major: string;
            };
            package: string;
        };
        capabilities: any[];
    };
};

type QMPCommandInfo = {
    name: string;
};

type QMPStatusInfo = {
    running: boolean;
    status: string;
};

type QMPObjectPropertyInfo = {
    name: string;
    type: "u8" | "u16" | "bool" | "str" | "double" | string;
    description?: string;
    "default-value"?: string;
};

type QMPBlockInfo = {
    device: string;
    qdev?: string;
    type: string;
    removable: boolean;
    locked: boolean;
    tray_open?: boolean;
    io_status?: object;
    inserted?: object;
};

type QMPError = {
    error: object;
};

type QMPReturn<T> = T extends never ? never : { return: T } | QMPError;

type QMPCommandWithArgs = "human-monitor-command" | "device_add" | "device_del" | "device-list-properties";
type QMPCommandNoArgs = "qmp_capabilities" | "query-commands" | "query-status" | "query-block";
type QMPCommand = QMPCommandWithArgs | QMPCommandNoArgs;

type QMPArgumentProps = {
    "command-line": string;
    driver: string;
    id: string;
    vendorid: number;
    productid: number;
    hostbus: number;
    hostaddr: number;
    hostdevice: string;
    typename: string;
};

type QMPArgument<T extends keyof QMPArgumentProps> =
    | {
          [Prop in T]?: QMPArgumentProps[Prop];
      }
    | "none";

type QMPCommandExpectedArgument<T extends QMPCommand> = T extends "human-monitor-command"
    ? QMPArgument<"command-line">
    : T extends "device_add"
      ? QMPArgument<"driver" | "id" | "productid" | "vendorid" | "hostbus" | "hostaddr" | "hostdevice">
      : T extends "device_del"
        ? QMPArgument<"id">
        : T extends "device-list-properties"
          ? QMPArgument<"typename">
          : never;

// TODO: determine return type of device_add and device_del
export type QMPResponse<T extends QMPCommand> = QMPReturn<
    T extends "qmp_capabilities"
        ? QMPGreeting
        : T extends "query-commands"
          ? QMPCommandInfo[]
          : T extends "query-status"
            ? QMPStatusInfo
            : T extends "human-monitor-command"
              ? string
              : T extends "device_add"
                ? object
                : T extends "device_del"
                  ? string // TODO: change this
                  : T extends "device-list-properties"
                    ? QMPObjectPropertyInfo[]
                    : T extends "query-block"
                      ? QMPBlockInfo[]
                      : never
>;

export class QMPManager {
    private static readonly IS_ALIVE_TIMEOUT = 2000;
    qmpSocket: Socket;
    // Buffer for assembling incoming QMP JSON fragments
    private _recvBuffer = "";
    // Pending requests map (id -> handlers)
    private _pending = new Map<
        string,
        {
            resolve: (v: any) => void;
            reject: (e: any) => void;
            timeout?: NodeJS.Timeout;
            // store original command for diagnostics
            cmd?: string;
        }
    >();

    /**
     * Please use {@link QMPManager.createConnection} instead.
     */
    constructor(socket: Socket) {
        this.qmpSocket = socket;

        // Create a locally-bound reference to the processor and also keep an instance binding
        // This guarantees the event handler always invokes a valid function (avoids lookup races).
        const _boundProcessRecvBuffer = this._processRecvBuffer.bind(this);
        (this as any)._processRecvBuffer = _boundProcessRecvBuffer;

        // Centralized data handler to safely assemble and dispatch JSON messages
        this.qmpSocket.on("data", (data: Buffer) => {
            try {
                // quick sanity logging for rare runtime cases where data arrives but processor is gone
                if (typeof _boundProcessRecvBuffer !== "function") {
                    logger.error("QMP data handler: local bound processor missing", { keys: Object.keys(this) });
                    return;
                }

                // append incoming chunk and process
                this._recvBuffer += data.toString();
                try {
                    _boundProcessRecvBuffer();
                } catch (inner) {
                    logger.error("QMP _boundProcessRecvBuffer threw:", inner);
                }
            } catch (e) {
                logger.error("Error in QMP data handler:", e);
            }
        });

        // Handle socket errors by rejecting all pending promises
        this.qmpSocket.on("error", err => {
            for (const [, handlers] of this._pending) {
                handlers.reject(err);
                if (handlers.timeout) clearTimeout(handlers.timeout);
            }
            this._pending.clear();
        });

        this.qmpSocket.on("close", () => {
            const err = new Error("QMP socket closed");
            for (const [, handlers] of this._pending) {
                handlers.reject(err);
                if (handlers.timeout) clearTimeout(handlers.timeout);
            }
            this._pending.clear();
        });
    }

    /**
     * Parse and dispatch any complete JSON messages currently buffered from QMP.
     * Handles: event notices (ignored), id-correlated responses (resolved),
     * and ``return`` responses when only one pending request exists.
     */
    private _processRecvBuffer() {
        const extractFirstJSON = (text: string): { jsonStr: string; rest: string } | null => {
            const start = text.indexOf("{");
            if (start === -1) return null;
            let depth = 0;
            let inString = false;
            let escape = false;
            for (let i = start; i < text.length; i++) {
                const ch = text[i];
                if (inString) {
                    if (escape) {
                        escape = false;
                    } else if (ch === "\\") {
                        escape = true;
                    } else if (ch === '"') {
                        inString = false;
                    }
                } else {
                    if (ch === '"') {
                        inString = true;
                    } else if (ch === "{") {
                        depth++;
                    } else if (ch === "}") {
                        depth--;
                        if (depth === 0) {
                            return { jsonStr: text.slice(start, i + 1), rest: text.slice(i + 1) };
                        }
                    }
                }
            }
            return null; // incomplete
        };

        while (true) {
            const first = extractFirstJSON(this._recvBuffer);
            if (!first) break;
            this._recvBuffer = first.rest;

            let parsed: any;
            try {
                parsed = JSON.parse(first.jsonStr);
            } catch (e) {
                logger.error("Failed to parse QMP JSON fragment", e);
                logger.error(`fragment (truncated): ${first.jsonStr.slice(0, 200)}...`);
                continue;
            }

            // Ignore event notices
            if (parsed && typeof parsed === "object" && "event" in parsed) {
                logger.debug("QMP event notice:", parsed.event);
                continue;
            }

            // Dispatch by id when present
            if (parsed && typeof parsed === "object" && "id" in parsed) {
                const pid = String(parsed.id);
                const pending = this._pending.get(pid);
                if (pending) {
                    clearTimeout(pending.timeout);
                    pending.resolve(parsed as any);
                    this._pending.delete(pid);
                } else {
                    logger.warn(`Received QMP response for unknown id: ${pid}`);
                }
                continue;
            }

            // If we receive a 'return' with no id, DO NOT auto-resolve pending requests —
            // this can mis-route responses (observed when unrelated 'query-status' payloads arrived).
            if (parsed && typeof parsed === "object" && "return" in parsed && !("id" in parsed)) {
                logger.warn(
                    "Unidentified QMP 'return' message received without id; ignoring (will not resolve pending).",
                    {
                        pendingCount: this._pending.size,
                        sample: parsed,
                    },
                );
                continue;
            }

            // Otherwise log unsolicited response
            logger.debug("Unsolicited QMP message:", parsed);
        }
    }

    /**
     * Creates a new {@link QMPManager} instance, returning a promise that resolves after the socket successfully connected
     *
     * May block if there is another connection taking up the socket, so be careful!
     *
     * @param host - The hostname of the qmp connection (e.g. 0.0.0.0, 127.0.0.1)
     * @param port - The port of the qmp connection (e.g. 6969, 420)
     *
     */
    static async createConnection(host: string, port: number): Promise<QMPManager> {
        // Helper: extract the first complete JSON object from a string (balanced-brace aware)
        const extractFirstJSON = (text: string): { jsonStr: string; rest: string } | null => {
            const start = text.indexOf("{");
            if (start === -1) return null;
            let depth = 0;
            let inString = false;
            let escape = false;
            for (let i = start; i < text.length; i++) {
                const ch = text[i];
                if (inString) {
                    if (escape) {
                        escape = false;
                    } else if (ch === "\\") {
                        escape = true;
                    } else if (ch === '"') {
                        inString = false;
                    }
                } else {
                    if (ch === '"') {
                        inString = true;
                    } else if (ch === "{") {
                        depth++;
                    } else if (ch === "}") {
                        depth--;
                        if (depth === 0) {
                            return { jsonStr: text.slice(start, i + 1), rest: text.slice(i + 1) };
                        }
                    }
                }
            }
            return null; // incomplete
        };

        return new Promise((resolve, reject) => {
            const socket = createConnection({ host, port }, () => {
                socket.once("error", reject);
                socket.once("data", data => {
                    try {
                        const text = data.toString();
                        const first = extractFirstJSON(text);
                        if (!first) {
                            // We couldn't parse a complete JSON object from the greeting
                            return reject(new Error(`Invalid QMP greeting (incomplete): ${text}`));
                        }

                        const response = JSON.parse(first.jsonStr);

                        if ("QMP" in response) {
                            return resolve(new QMPManager(socket));
                        }

                        reject(new Error(`Invalid QMP response: ${text}`));
                    } catch (e) {
                        logger.error(e);
                        logger.error(`QMP request 'data.toString()': ${data.toString()}`);
                        reject(e);
                    }
                });
            });
        });
    }

    /**
     * Executes the QMP command specified by `command`.
     *
     * Optionally, you can specify an argument for given command if it requires one.
     *
     * @param command
     *
     */
    async executeCommand<C extends QMPCommandNoArgs>(command: C): Promise<QMPResponse<C>>;
    async executeCommand<C extends QMPCommandWithArgs>(
        command: C,
        qmpArgument: QMPCommandExpectedArgument<C>,
    ): Promise<QMPResponse<C>>;
    async executeCommand<C extends QMPCommand>(
        command: C,
        qmpArgument?: QMPCommandExpectedArgument<C>,
    ): Promise<QMPResponse<C>> {
        const message = {
            execute: command,
            ...(qmpArgument && { arguments: qmpArgument }),
        };

        return new Promise<QMPResponse<C>>((resolve, reject) => {
            // Attach a unique id to correlate responses
            const id = `req_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
            (message as any).id = id;

            // Register pending handlers before writing
            const timeout = setTimeout(() => {
                if (this._pending.has(id)) {
                    this._pending.get(id)!.reject(new Error("QMP command timeout"));
                    this._pending.delete(id);
                }
            }, 15000); // 15s timeout

            this._pending.set(id, { resolve, reject, timeout, cmd: String(command) });

            this.qmpSocket.write(JSON.stringify(message), err => {
                if (err) {
                    clearTimeout(timeout);
                    this._pending.delete(id);
                    logger.error(err);
                    reject(err);
                }
            });
        });
    }

    /**
     * Checks whether the socket is still alive, then queries the status of the QMP connection.
     *
     * @returns True if the socket is alive and if the QMP command `query-status` returned without errors.
     *
     */
    async isAlive(): Promise<boolean> {
        return new Promise(resolve => {
            if (this.qmpSocket.closed || this.qmpSocket.destroyed) {
                return resolve(false);
            }

            const tm = setTimeout(() => {
                logger.warn("Querying status of QMP connection timed out.");
                resolve(false);
            }, QMPManager.IS_ALIVE_TIMEOUT);

            this.executeCommand("query-status")
                .then(response => {
                    assert("return" in response);
                    clearTimeout(tm);
                    resolve(true);
                })
                .catch(e => {
                    logger.error(`There was an error querying status of QMP connection`);
                    logger.error(e);
                })
                .finally(() => {
                    clearTimeout(tm);
                    resolve(false);
                });
        });
    }
}
