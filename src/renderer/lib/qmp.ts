import { WINBOAT_DIR } from "./constants";
import { createLogger } from "../utils/log";
const path: typeof import('path') = require('path');
import { type Socket } from 'net';
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

type QMPError = {
    error: object
};

type QMPReturn<T> = T extends never ? never : { return: T };

type QMPCommandWithArgs = "human-monitor-command" | "device_add" | "device_del"
type QMPCommandNoArgs = "qmp_capabilities" | "query-commands";
type QMPCommand = QMPCommandWithArgs | QMPCommandNoArgs;

type QMPArgumentProps = {
    "command-line": string,
    "driver": string,
    "id": string,
    "vendorid": number,
    "productid": number,
    "hostbus": string,
    "hostaddr": string
};

type QMPArgument<T extends keyof QMPArgumentProps> = {
    [Prop in T]?: QMPArgumentProps[Prop]
} | "none";

type QMPCommandExpectedArgument<T extends QMPCommand> = 
    T extends "human-monitor-command" ? QMPArgument<"command-line"> : 
    T extends "device_add" ? QMPArgument<"driver" | "id" | "productid" | "vendorid" | "hostbus" | "hostaddr"> : 
    T extends "device_del" ? QMPArgument<"id"> : 
    never


// TODO: determine return type of device_add and device_del
export type QMPResponse<T extends QMPCommand> = QMPReturn<
            T extends "qmp_capabilities" ? QMPGreeting : 
            T extends "query-commands" ? QMPCommandInfo[] :
            T extends "human-monitor-command" ? string :
            T extends "device_add" ? object :
            T extends "device_del" ? string : // TODO: change this 
            never 
>;

export class QMPManager {
    qmpSocket: Socket;
    status: QMPStatus;

    /**
     * Please use {@link QMPManager.createConnection} instead.
     */
    constructor(socket: Socket) {
        this.status = "Connected";
        this.qmpSocket = socket;
    }

    /**
     * Creates a new {@link QMPManager} instance, returning a promise that resolves after the socket successfully connected
     * @param host - The hostname of the qmp connection (e.g. 0.0.0.0, 127.0.0.1)
     * @param port - The port of the qmp connection (e.g. 6969, 420)
     */

    static async createConnection(host: string, port: number): Promise<QMPManager> {
        return new Promise((resolve, reject) => {
            const socket = createConnection({ host, port }, () => {
                socket.once("error", reject);
                socket.once("data", (data) => {
                    try {
                        const response = JSON.parse(data.toString());
                        
                        if("QMP" in response) {
                            resolve(new QMPManager(socket));
                        } 
    
                        throw new Error(`Invalid QMP response: ${data.toString()}`);
                    } catch (e) {
                        reject(e);
                    }
                });
            });
        });
    }
    
    async executeCommand<C extends QMPCommandNoArgs>(command: C): Promise<QMPResponse<C>>
    async executeCommand<C extends QMPCommandWithArgs>(command: C, qmpArgument: QMPCommandExpectedArgument<C>): Promise<QMPResponse<C>>
    async executeCommand<C extends QMPCommand>(command: C,  qmpArgument?: QMPCommandExpectedArgument<C>): Promise<QMPResponse<C>> {
        const message = { 
            execute: command,
            ...qmpArgument && { arguments: qmpArgument }
        };


        console.log("message: ", message);

        return new Promise((resolve, reject) => {
            this.qmpSocket.write(JSON.stringify(message), (err) => {
                if(err) {
                    logger.error(err);
                    reject();
                }
                this.qmpSocket.once("data", (data: Buffer) => {
                    try {
                        resolve(JSON.parse(data.toString()));
                    } catch(e) {
                        reject(e);
                    }
                });
            });
        });
    }
}