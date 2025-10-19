 import { ComposeConfig } from "../../../types";
import {  WINBOAT_DIR } from "../constants";
import { createLogger } from "../../utils/log";
const path: typeof import('path') = require('path');

export const containerLogger = createLogger(path.join(WINBOAT_DIR, 'container.log'));

export type ComposeDirection = "up" | "down";
export type ContainerAction = "start" | "stop" | "pause" | "unpause";

export abstract class ContainerManager {
    abstract readonly defaultCompose: ComposeConfig;
    abstract readonly composeFilePath: string;
    abstract readonly executableAlias: string;

    abstract writeCompose(compose: ComposeConfig): void;
    abstract compose(direction: ComposeDirection): Promise<void>;
    abstract container(action: ContainerAction): Promise<void>;
    abstract getStatus(): Promise<ContainerStatus>;
    abstract exists(): Promise<boolean>;

    // static "abstract" function
    static async _getSpecs(): Promise<any> {
        throw new Error("Can't get specs of abstract class ContainerManager");
    }
}

export enum ContainerStatus {
    CREATED = "Created", // unused
    RUNNING = "Running",
    PAUSED = "Paused",
    EXITED = "Exited",
    UKNOWN = "Unknown"
};