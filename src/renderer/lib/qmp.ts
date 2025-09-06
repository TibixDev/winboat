import { WINBOAT_DIR } from "./constants";
import { createLogger } from "../utils/log";
const path: typeof import('path') = require('path');
import { type Socket } from 'net';
import { assert } from "@vueuse/core";
const { createConnection }: typeof import('net') = require('net');

const logger = createLogger(path.join(WINBOAT_DIR, 'qmp.log'));

type QMPStatus = "Connected" | "Closed";

type QMPGreeting = {
    QMP: {
        version: {
            qemu: {
                micro: string,
                minor: string,
                major: string
            },
            package: string
        },
        capabilities: any[]
    }
}

type QMPCommandInfo = {
    name: string
};

type QMPStatusInfo = {
    running: boolean,
    status: string
};

type QMPObjectPropertyInfo = {
    name: string,
    type: "u8" | "u16" | "bool" | "str" | "double" | string,
    description?: string,
    "default-value"?: string
};

type QMPBlockInfo = {
    device: string,
    qdev?: string,
    type: string,
    removable: boolean,
    locked: boolean,
    tray_open?: boolean,
    io_status?: object,
    inserted?: object
};

type QMPError = {
    error: object
};

type QMPReturn<T> = T extends never ? never : { return: T } | QMPError;

type QMPCommandWithArgs = "human-monitor-command" | "device_add" | "device_del" | "device-list-properties";
type QMPCommandNoArgs = "qmp_capabilities" | "query-commands" | "query-status" | "query-block";
type QMPCommand = QMPCommandWithArgs | QMPCommandNoArgs;

type QMPArgumentProps = {
    "command-line": string,
    "driver": string,
    "id": string,
    "vendorid": number,
    "productid": number,
    "hostbus": number,
    "hostaddr": number,
    "hostdevice": string
    "typename": string,
};

type QMPArgument<T extends keyof QMPArgumentProps> = {
    [Prop in T]?: QMPArgumentProps[Prop]
} | "none";

type QMPCommandExpectedArgument<T extends QMPCommand> = 
    T extends "human-monitor-command" ? QMPArgument<"command-line"> : 
    T extends "device_add" ? QMPArgument<"driver" | "id" | "productid" | "vendorid" | "hostbus" | "hostaddr" | "hostdevice"> : 
    T extends "device_del" ? QMPArgument<"id"> : 
    T extends "device-list-properties" ? QMPArgument<"typename"> :
    never


// TODO: determine return type of device_add and device_del
export type QMPResponse<T extends QMPCommand> = QMPReturn<
            T extends "qmp_capabilities" ? QMPGreeting : 
            T extends "query-commands" ? QMPCommandInfo[] :
            T extends "query-status" ? QMPStatusInfo :
            T extends "human-monitor-command" ? string :
            T extends "device_add" ? object :
            T extends "device_del" ? string : // TODO: change this 
            T extends "device-list-properties" ? QMPObjectPropertyInfo[] :
            T extends "query-block" ? QMPBlockInfo[] :
            never 
>;

export class QMPManager {
    private static IS_ALIVE_TIMEOUT = 2000;
    qmpSocket: Socket;

    /**
     * Please use {@link QMPManager.createConnection} instead.
     */
    constructor(socket: Socket) {
        this.qmpSocket = socket;
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
        return new Promise((resolve, reject) => {
            const socket = createConnection({ host, port }, () => {
                socket.once("error", reject);
                socket.once("data", (data) => {
                    try {
                        const response = JSON.parse(data.toString());
                        
                        if("QMP" in response) {
                            return resolve(new QMPManager(socket));
                        } 
    
                        reject(new Error(`Invalid QMP response: ${data.toString()}`));
                    } catch (e) {
                        logger.error(e);
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
    async executeCommand<C extends QMPCommandNoArgs>(command: C): Promise<QMPResponse<C>>
    async executeCommand<C extends QMPCommandWithArgs>(command: C, qmpArgument: QMPCommandExpectedArgument<C>): Promise<QMPResponse<C>>
    async executeCommand<C extends QMPCommand>(command: C,  qmpArgument?: QMPCommandExpectedArgument<C>): Promise<QMPResponse<C>> {
        const message = { 
            execute: command,
            ...qmpArgument && { arguments: qmpArgument }
        };

        return new Promise<QMPResponse<C>>((resolve, reject) => {
            this.qmpSocket.write(JSON.stringify(message), (err) => {
                if(err) {
                    logger.error(err);
                    reject(err);
                }
                this.qmpSocket.once("data", (data: Buffer) => {
                    try {
                        resolve(JSON.parse(data.toString()));
                    } catch(e) {
                        logger.error(e);
                        reject(e);
                    }
                });
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

            this.executeCommand("query-status").then((response) => {
                assert("return" in response);
                clearTimeout(tm);
                resolve(true);
            }).catch(e => {
                logger.error(`There was an error querying status of QMP connection`);
                logger.error(e);
            }).finally(() => {
                clearTimeout(tm);
                resolve(false);
            });
        })
    }

    private static handleError(e: unknown, msg?: string) {
    }
}