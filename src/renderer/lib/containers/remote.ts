import { ComposeConfig, LongPortMapping } from "../../../types";
import { REMOTE_DEFAULT_COMPOSE } from "../../data/remote";
import { capitalizeFirstLetter } from "../../utils/capitalize";
import { ComposePortEntry } from "../../utils/port";
import { WINBOAT_DIR } from "../constants";
import { Winboat } from "../winboat";
import { PortEntryProtocol } from "../../../types";
import {
    ComposeArguments,
    ComposeDirection,
    ContainerAction,
    containerLogger,
    ContainerManager,
    ContainerStatus,
} from "./container";
import YAML from "yaml";
import { CommonPorts, createContainer } from "./common";

const path: typeof import("node:path") = require("node:path");
const fs: typeof import("node:fs") = require("node:fs");

export type RemoteSpecs = {
    dummyInstalled: boolean;
    dummyComposeInstalled: boolean;
};

type ResolveStrings = {
    address: string;
    family: string;
};
    
export class RemoteContainer extends ContainerManager {
    defaultCompose = REMOTE_DEFAULT_COMPOSE;
    composeFilePath = path.join(WINBOAT_DIR, "remote-compose.yml"); // TODO: If/when we support multiple VM's we need to put this in the constructor
    executableAlias = "remote";

    cachedPortMappings: ComposePortEntry[] | null = null;

    constructor() {
        super();
    }

    writeCompose(compose: ComposeConfig): void {
        const composeContent = YAML.stringify(compose, { nullStr: "" });
        fs.writeFileSync(this.composeFilePath, composeContent, { encoding: "utf-8" });

        containerLogger.info(`Wrote to compose file at: ${this.composeFilePath}`);
        containerLogger.info(`Compose file content: ${JSON.stringify(composeContent, null, 2)}`);
    }

    async compose(direction: ComposeDirection, extraArgs: ComposeArguments[] = []): Promise<void> {
    }

    async container(action: ContainerAction): Promise<void> {
    }
    async port(): Promise<ComposePortEntry[]> {
        if (this.cachedPortMappings) {
            return this.cachedPortMappings;
        }
        const ret = [];
        const ports = [];
        let hostName = this.hostName;

        /* Add the .local domain if none. */
        if (!hostName.includes(".")) {
            hostName += ".local"
        }

        for (const value of Object.values(CommonPorts).filter(k => !isNaN(Number(k)))) {
            let port = Number(value);

            if (port === CommonPorts.QMP) continue;

            const basePort = hostName + ":" + port.toString() +  ":" + port.toString();
        
            let proto = <PortEntryProtocol>"tcp";

            if (port !== CommonPorts.RDP) {
                const portEntry = new ComposePortEntry(port, port, {hostIP: hostName, protocol: proto});
                ports.push(basePort);
                ret.push(portEntry);
            }
            else {
                const portTcp = basePort + "/" + proto.toString();
                const portEntryTcp = new ComposePortEntry(port, port, {hostIP: hostName, protocol: proto});
                ports.push(portTcp);
                ret.push(portEntryTcp);
 
                proto = <PortEntryProtocol>"udp";
                const portUdp = basePort + "/" + proto.toString();
                const portEntryUdp = new ComposePortEntry(port, port, {hostIP: hostName, protocol: proto});
                ports.push(portUdp);
                ret.push(portEntryUdp);
            }
        }

        containerLogger.info("Remote name: ", hostName);
        containerLogger.info("Remote container active port mappings: ", JSON.stringify(ret));

        this.cachedPortMappings = ret;

        /* Update compose file. */
        if (ports.length) {
            const currentCompose = Winboat.readCompose(this.composeFilePath);
            currentCompose.services.windows.ports = ports;
            this.writeCompose(currentCompose);
            containerLogger.info("Update compose file with resolved ports: ", ports);
        }
        
        return ret;
    }

    async remove(): Promise<void> {
    }
    
    async getStatus(): Promise<ContainerStatus> {
        const statusMap = {
            created: ContainerStatus.CREATED,
            restarting: ContainerStatus.UNKNOWN,
            removing: ContainerStatus.UNKNOWN,
            running: ContainerStatus.RUNNING,
            paused: ContainerStatus.PAUSED,
            exited: ContainerStatus.EXITED,
            dead: ContainerStatus.UNKNOWN,
        } as const;
        
        return ContainerStatus.RUNNING;
    }

    async exists(): Promise<boolean> {
        return true;
    }

    get containerName(): string {
        return this.defaultCompose.services.windows.container_name; // TODO: investigate whether we should use the compose on disk
    }

    static override async _getSpecs(): Promise<RemoteSpecs> {
        let specs: RemoteSpecs = {
            dummyInstalled: true,
            dummyComposeInstalled: true,
        };

        return specs;
    }
}