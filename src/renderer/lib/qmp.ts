import { WINBOAT_DIR } from "./constants";
import { createLogger } from "../utils/log";
const path: typeof import("path") = require("node:path");
import { type Socket } from "net";
import { EventEmitter } from "events";
import { assert } from "@vueuse/core";
const { createConnection }: typeof import("net") = require("node:net");

const logger = createLogger(path.join(WINBOAT_DIR, "qmp.log"));

type QMPStatus = "Connected" | "Closed";

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

type QMPQueryBalloon = {
    actual: number;
};

type QMPError = {
    error: object;
};

type QMPReturn<T> = T extends never ? never : { return: T } | QMPError;

type QMPCommandWithArgs = "human-monitor-command" | "device_add" | "device_del" | "device-list-properties";
type QMPCommandNoArgs = "qmp_capabilities" | "query-commands" | "query-status" | "query-block" | "query-balloon";
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
                      : T extends "query-balloon"
                        ? QMPQueryBalloon[]
                        : never
>;

type QMPEvents = {
    message: [message: any];
};

export class QMPManager extends EventEmitter<QMPEvents> {
    private static readonly IS_ALIVE_TIMEOUT = 2000;
    private static readonly DEFAULT_COMMAND_TIMEOUT = 10000;
    private qmpSocket!: Socket;
    private buffer: Buffer = Buffer.alloc(0);
    private commandId: number = 0;
    private pendingCommands: Map<number, { resolve: (data: any) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }> = new Map();

    /**
     * Please use {@link QMPManager.createConnection} instead.
     */
    private constructor(private host: string, private port: number) {
        super();
    }

    private async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.once("message", (message) => {
                if ("QMP" in message) {
                    resolve();
                } else {
                    reject(new Error(`Invalid QMP greeting: ${JSON.stringify(message)}`));
                }
            });
            
            this.qmpSocket = createConnection({ host: this.host, port: this.port }, () => {
                this.qmpSocket.once("error", reject);
                this.qmpSocket.on("data", this.handleData);
            });
        });
    }

    public disconnect() {
        this.qmpSocket.off("data", this.handleData);
        this.buffer = Buffer.alloc(0);
        this.qmpSocket.destroy();
    }

    private handleData = (data: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, data]);
        let separatorIndex: number;
        while ((separatorIndex = this.buffer.indexOf("\r\n")) !== -1) {
            const messageBuffer = this.buffer.subarray(0, separatorIndex);
            this.buffer = this.buffer.subarray(separatorIndex + 2);
            if (messageBuffer.length > 0) {
                try {
                    const parsed = JSON.parse(messageBuffer.toString());
                    this.handleMessage(parsed);
                } catch (e) {
                    logger.error("Failed to parse QMP message:", e);
                    logger.error("Message:", messageBuffer.toString());
                }
            }
        }
    }

    private handleMessage(message: any) {
        if ("event" in message) {
            // Currently ignored.
            return;
        } else if ("id" in message) {
            const pending = this.pendingCommands.get(message.id);
            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingCommands.delete(message.id);
                pending.resolve(message);
            }
        } else {
            // Generic message (usually the greeting).
            this.emit("message", message);
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
    static async createConnection(host: string, port: number) {
        const manager = new QMPManager(host, port);
        await manager.connect();
        return manager;
    }

    /**
     * Executes the QMP command specified by `command`.
     *
     * Optionally, you can specify an argument for given command if it requires one and a timeout in ms.
     *
     * @param command
     *
     */
    async executeCommand<C extends QMPCommandNoArgs>(command: C, timeout?: number): Promise<QMPResponse<C>>;
    async executeCommand<C extends QMPCommandWithArgs>(
        command: C,
        qmpArgument: QMPCommandExpectedArgument<C>,
        timeout?: number,
    ): Promise<QMPResponse<C>>;
    async executeCommand<C extends QMPCommand>(
        command: C,
        qmpArgument_or_timeout?: QMPCommandExpectedArgument<C> | number,
        timeout?: number,
    ): Promise<QMPResponse<C>> {
        const id = ++this.commandId;
        const actualTimeout = typeof qmpArgument_or_timeout === "number" ? qmpArgument_or_timeout : (timeout ?? QMPManager.DEFAULT_COMMAND_TIMEOUT);
        const actualArgument = typeof qmpArgument_or_timeout === "object" ? qmpArgument_or_timeout : undefined;
        const message = {
            execute: command,
            id: id,
            ...(actualArgument && { arguments: actualArgument }),
        };

        return new Promise<QMPResponse<C>>((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                this.pendingCommands.delete(id);
                reject(new Error(`QMP command '${command}' timed out after ${actualTimeout}ms`));
            }, actualTimeout);

            this.pendingCommands.set(id, { resolve, reject, timeout: timeoutHandle });

            this.qmpSocket.write(JSON.stringify(message) + "\r\n", err => {
                if (err) {
                    logger.error(err);
                    const pending = this.pendingCommands.get(id);
                    if (pending) {
                        clearTimeout(pending.timeout);
                        this.pendingCommands.delete(id);
                    }
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
        return new Promise(async (resolve, _) => {
            if (this.qmpSocket.closed || this.qmpSocket.destroyed) {
                return resolve(false);
            }

            const tm = setTimeout(_ => {
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

    private static handleError(e: unknown, msg?: string) {}
}
