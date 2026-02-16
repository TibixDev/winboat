import { ComposeConfig } from "../../types";
import { RESTART_ON_FAILURE } from "../lib/constants";

export const DOCKER_DEFAULT_COMPOSE: ComposeConfig = {
    name: "dosboat",
    volumes: {
        data: null,
    },
    services: {
        freedos: {
            build: {
                context: "./build/freedos-image",
                dockerfile: "Dockerfile"
            },
            container_name: "DOSBoat",
            environment: {
                VERSION: "1.4",
                RAM_SIZE: "256M",
                CPU_CORES: "1",
                DISK_SIZE: "2G",
                HOME: "${HOME}",
                BOOT_MODE: "legacy",
                USER_PORTS: "",
                HOST_PORTS: "7149",
                ARGUMENTS: "",
            },
            cap_add: ["NET_ADMIN"],
            privileged: true,
            ports: [
                "127.0.0.1:8006:8006", // VNC Web Interface
                "127.0.0.1:7149:7149", // QEMU QMP Port
            ],
            stop_grace_period: "120s",
            restart: RESTART_ON_FAILURE,
            volumes: [
                "data:/storage",
                "${HOME}:/shared",
                "/dev/bus/usb:/dev/bus/usb", // USB bus access for USB-to-serial adapters
                "./images/FD14-base.qcow2:/oem/base.qcow2:ro",
            ],
            devices: [
                "/dev/kvm",
                // Serial port devices are added dynamically based on user configuration
            ],
        },
    },
};
