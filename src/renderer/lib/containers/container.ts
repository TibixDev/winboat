import { ComposeConfig } from "../../../types";
import {  WINBOAT_DIR } from "../constants";
import { createLogger } from "../../utils/log";
const path: typeof import('path') = require('path');

export const containerLogger = createLogger(path.join(WINBOAT_DIR, 'container.log'));

export type ComposeDirection = "up" | "down";

export abstract class ContainerManager {
    abstract readonly defaultCompose: ComposeConfig;
    abstract readonly composeFilePath: string;
    abstract readonly executableAlias: string;

    abstract writeCompose(compose: ComposeConfig): void;
    abstract compose(direction: ComposeDirection): Promise<void>;
    // abstract get status(): number;

    // static "abstract" function
    static _getSpecs(): any {
        throw new Error("Can't get specs of abstract class ContainerManager");
    }
}

export enum ContainerStatus {
    RUNNING = "Running",
    PAUSED = "Paused",
    EXITED = "Exited",
    UKNOWN = "Unknown"
};