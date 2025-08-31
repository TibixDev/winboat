import { type WindowsVersionKey } from "./renderer/lib/constants";

export type Specs = {
    cpuThreads: number;
    ramGB: number;
    diskSpaceGB: number;
    kvmEnabled: boolean;
    dockerInstalled: boolean;
    dockerComposeInstalled: boolean,
    dockerIsInUserGroups: boolean;
    freeRDPInstalled: boolean;
    ipTablesLoaded: boolean;
    iptableNatLoaded: boolean;
}

export type InstallConfiguration = {
    windowsVersion: WindowsVersionKey;
    windowsLanguage: string;
    cpuThreads: number;
    ramGB: number;
    diskSpaceGB: number;
    username: string;
    password: string;
}

export type WinApp = {
    Name: string;
    Path: string;
    Icon: string;
    Source: string;
    Usage?: number;
}

export type ComposeConfig = {
    name: string;
    volumes: {
        [key: string]: null | string;
    };
    services: {
        windows: {
            image: string;
            container_name: string;
            environment: {
                VERSION: WindowsVersionKey;
                RAM_SIZE: string;
                CPU_CORES: string;
                DISK_SIZE: string;
                USERNAME: string;
                PASSWORD: string;
                HOME: string;
                LANGUAGE: string;
                ARGUMENTS: string;
                [key: string]: string; // Allow additional env vars
            };
            privileged: boolean;
            ports: string[];
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
        usage: number, // Percentage, from 0 to 100%
        frequency: number, // Frequency in Mhz (e.g. 2700)
    },
    ram: {
        used: number, // RAM Usage in MB (e.g. 500)
        total: number // RAM Total in MB (e.g. 4096)
        percentage: number // RAM Usage in percentage (e.g. 70%)
    },
    disk: {
        used: number, // Disk Usage in MB (e.g. 29491)
        total: number, // Disk Total in MB (e.g. 102400)
        percentage: number // Disk Usage in percentage (e.g. 70%)
    }
}

export type GuestServerVersion = {
    version: string;
    commit_hash: string;
    build_time: string;
}

export type GuestServerUpdateResponse = {
    filename: string;
    status: string;
    temp_path: string;
}

export type USBDevice = {
    vendorID: string,
    productID: string,
    alias: string
};