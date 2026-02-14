import { ComposeConfig } from "../../types";
import { RESTART_ON_FAILURE } from "../lib/constants";

export const PODMAN_DEFAULT_COMPOSE: ComposeConfig = {
    name: "dosboat",
    volumes: {
        data: null,
    },
    services: {
        freedos: {
            image: "ghcr.io/dockur/freedos:latest",
            container_name: "DOSBoat",
            environment: {
                VERSION: "1.3",
                RAM_SIZE: "256M",
                CPU_CORES: "1",
                DISK_SIZE: "2G",
                HOME: "${HOME}",
                BOOT_MODE: "legacy",
                NETWORK: "user",
                USER_PORTS: "",
                HOST_PORTS: "7149",
                ARGUMENTS: "-qmp tcp:0.0.0.0:7149,server,wait=off",
            },
            cap_add: ["NET_ADMIN"],
            ports: [
                "127.0.0.1::8006", // VNC Web Interface
                "127.0.0.1::7149", // QEMU QMP Port
            ],
            stop_grace_period: "120s",
            restart: RESTART_ON_FAILURE,
            privileged: true,
            volumes: [
                "data:/storage",
                "${HOME}:/shared",
                "./oem:/oem",
            ],
            devices: [
                "/dev/kvm",
                "/dev/bus/usb",
                // Serial port devices are added dynamically based on user configuration
            ],
        },
    },
};
