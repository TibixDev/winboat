import { WINBOAT_DIR } from "./constants";
import { createLogger } from "../utils/log";
const path: typeof import('path') = require('path');
import { type Socket } from 'net';
const { createConnection }: typeof import('net') = require('net');

const logger = createLogger(path.join(WINBOAT_DIR, 'qmp.log'));

type QMPStatus = "Connected" | "Closed";
type QMPCommand = "qmp_capabilities";

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
                resolve(new QMPManager(socket));
            });
        });
    }

    async executeCommand(command: QMPCommand): Promise<string> {
        const payload = JSON.stringify({ execute: command });
        return new Promise((resolve, reject) => {
            this.qmpSocket.write(payload, (err) => {
                if(err) {
                    logger.error(err);
                    reject();
                }
                this.qmpSocket.once("data", (data: Buffer) => {
                    console.log(data);
                    resolve(JSON.parse(String.fromCharCode(...data)));
                });
            });
        });
    }
}