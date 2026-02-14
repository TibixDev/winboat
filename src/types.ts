import { type FreeDOSVersionKey } from "./renderer/lib/constants";
import { ContainerRuntimes } from "./renderer/lib/containers/common";
import { type Dosboat } from "./renderer/lib/winboat";

export type Specs = {
    cpuCores: number;
    ramGB: number;
    kvmEnabled: boolean;
};

export type InstallConfiguration = {
    freedosVersion: FreeDOSVersionKey;
    cpuCores: number;
    ramGB: number;
    installFolder: string;
    diskSpaceGB: number;
    customIsoPath?: string;
    sharedFolderPath?: string;
    container: ContainerRuntimes;
    serialPorts?: string[];
};

export type WinApp = {
    id?: string;
    Name: string;
    Path: string;
    Args: string;
    Icon: string;
    Source: string;
    Usage?: number;
};

export type CustomAppCallbacks = {
    [key: string]: null | ((context: Dosboat) => void);
};

export type PortEntryProtocol = "tcp" | "udp";

export type LongPortMapping = {
    target: number;
    published?: string;
    host_ip?: string;
    protocol?: PortEntryProtocol;
    app_protocol?: string;
    mode?: "host" | "ingress";
    name?: string;
};

export type ComposeConfig = {
    name: string;
    volumes: {
        [key: string]: null | string;
    };
    networks?: {
        [key: string]: {
            external: boolean;
        };
    };
    services: {
        freedos: {
            image?: string;
            build?: {
                context: string;
                dockerfile: string;
            };
            container_name: string;
            environment: {
                VERSION: FreeDOSVersionKey;
                RAM_SIZE: string;
                CPU_CORES: string;
                DISK_SIZE: string;
                HOME: string;
                BOOT_MODE: string;
                ARGUMENTS: string;
                HOST_PORTS: string;
                USER_PORTS?: string;
                CUSTOM_ISO?: string;
                [key: string]: string | undefined; // Allow additional env vars
            };
            privileged?: boolean;
            ports: Array<string | LongPortMapping>;
            network_mode?: string;
            cap_add: string[];
            stop_grace_period: string;
            restart: string;
            volumes: string[];
            devices: string[];
        };
    };
};

export type Metrics = {
    cpu: {
        usage: number; // Percentage, from 0 to 100%
        frequency: number; // Frequency in Mhz (e.g. 2700)
    };
    ram: {
        used: number; // RAM Usage in MB (e.g. 500)
        total: number; // RAM Total in MB (e.g. 4096)
        percentage: number; // RAM Usage in percentage (e.g. 70%)
    };
    disk: {
        used: number; // Disk Usage in MB (e.g. 29491)
        total: number; // Disk Total in MB (e.g. 102400)
        percentage: number; // Disk Usage in percentage (e.g. 70%)
    };
};

export type GuestServerVersion = {
    version: string;
    commit_hash: string;
    build_time: string;
};

export type GuestServerUpdateResponse = {
    filename: string;
    status: string;
    temp_path: string;
};

export type USBDevice = {
    vendorID: string;
    productID: string;
    alias: string;
};
