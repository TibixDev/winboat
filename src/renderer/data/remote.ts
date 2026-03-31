import { ComposeConfig } from "../../types";
import { RESTART_NO } from "../lib/constants";

export const REMOTE_DEFAULT_COMPOSE: ComposeConfig = {
    name: "winboat",
    volumes: {
        data: null,
    },
    services: {
        windows: {
            image: "ghcr.io/dockur/windows:5.14",
            container_name: "Remote",
            environment: {
                VERSION: "remote",
                RAM_SIZE: "4G",
                CPU_CORES: "4",
                DISK_SIZE: "64G",
                REMOTENAME: "MyWindowsPc",
                USERNAME: "MyWindowsUser",
                PASSWORD: "MyWindowsPassword",
                HOME: "${HOME}",
                LANGUAGE: "English",
                HOST_PORTS: "",
                ARGUMENTS: "",
            },
            cap_add: ["NET_ADMIN"],
            privileged: true,
            ports: [],
            stop_grace_period: "120s",
            restart: RESTART_NO,
            volumes: [],
            devices: [],
        },
    },
};
