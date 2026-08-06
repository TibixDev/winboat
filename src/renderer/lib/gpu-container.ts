import type { ComposeConfig } from "../../types";
import { requiresNvidiaContainerSupport, type RenderDevice } from "./gpu";

type WindowsService = ComposeConfig["services"]["windows"];
type DeviceReservation = NonNullable<
    NonNullable<NonNullable<NonNullable<WindowsService["deploy"]>["resources"]>["reservations"]>["devices"]
>[number];

const NVIDIA_DRIVER = "nvidia";
const NVIDIA_GRAPHICS_CAPABILITY = "graphics";
const NVIDIA_RENDER_ENVIRONMENT = {
    __NV_PRIME_RENDER_OFFLOAD: "1",
    __EGL_VENDOR_LIBRARY_FILENAMES: "/usr/share/glvnd/egl_vendor.d/10_nvidia.json",
    __GLX_VENDOR_LIBRARY_NAME: "nvidia",
    __VK_LAYER_NV_optimus: "NVIDIA_only",
    VK_ICD_FILENAMES: "/etc/vulkan/icd.d/nvidia_icd.json",
    GBM_BACKEND: "nvidia-drm",
    GBM_BACKENDS_PATH: "/usr/lib/gbm:/usr/lib/x86_64-linux-gnu/gbm",
} as const;

const NVIDIA_ENVIRONMENT_KEYS = ["NVIDIA_DRIVER_CAPABILITIES", ...Object.keys(NVIDIA_RENDER_ENVIRONMENT)];

function getNvidiaReservations(service: WindowsService): DeviceReservation[] {
    return (service.deploy?.resources?.reservations?.devices || []).filter(
        reservation => reservation.driver === NVIDIA_DRIVER,
    );
}

function hasNvidiaGraphicsCapability(value?: string): boolean {
    const capabilities = new Set((value || "").split(",").map(capability => capability.trim().toLowerCase()));
    return capabilities.has("all") || capabilities.has(NVIDIA_GRAPHICS_CAPABILITY);
}

function nvidiaRenderEnvironmentNeedsUpdate(service: WindowsService): boolean {
    return Object.entries(NVIDIA_RENDER_ENVIRONMENT).some(([key, value]) => service.environment[key] !== value);
}

export function gpuContainerConfigNeedsUpdate(service: WindowsService, device?: RenderDevice): boolean {
    const nvidiaReservations = getNvidiaReservations(service);

    if (!requiresNvidiaContainerSupport(device)) {
        return (
            nvidiaReservations.length > 0 || NVIDIA_ENVIRONMENT_KEYS.some(key => service.environment[key] !== undefined)
        );
    }

    const reservation = nvidiaReservations[0];
    return (
        !device?.nvidiaUuid ||
        nvidiaReservations.length !== 1 ||
        reservation.device_ids?.length !== 1 ||
        reservation.device_ids[0] !== device.nvidiaUuid ||
        !reservation.capabilities.includes("gpu") ||
        !hasNvidiaGraphicsCapability(service.environment.NVIDIA_DRIVER_CAPABILITIES) ||
        nvidiaRenderEnvironmentNeedsUpdate(service)
    );
}

export function configureGpuContainer(service: WindowsService, device: RenderDevice): void {
    const reservations = service.deploy?.resources?.reservations?.devices || [];
    const nonNvidiaReservations = reservations.filter(reservation => reservation.driver !== NVIDIA_DRIVER);

    if (!requiresNvidiaContainerSupport(device)) {
        for (const key of NVIDIA_ENVIRONMENT_KEYS) delete service.environment[key];

        const composeReservations = service.deploy?.resources?.reservations;
        if (!composeReservations) return;

        if (nonNvidiaReservations.length) {
            composeReservations.devices = nonNvidiaReservations;
            return;
        }

        delete composeReservations.devices;
        if (Object.keys(composeReservations).length === 0) delete service.deploy?.resources?.reservations;
        if (service.deploy?.resources && Object.keys(service.deploy.resources).length === 0) {
            delete service.deploy.resources;
        }
        if (service.deploy && Object.keys(service.deploy).length === 0) delete service.deploy;
        return;
    }

    if (!device.nvidiaUuid) {
        throw new Error(`Could not map ${device.path} to an NVIDIA GPU UUID through nvidia-smi.`);
    }

    const currentCapabilities = service.environment.NVIDIA_DRIVER_CAPABILITIES;
    if (!hasNvidiaGraphicsCapability(currentCapabilities)) {
        const capabilities = new Set(
            (currentCapabilities || "")
                .split(",")
                .map(capability => capability.trim().toLowerCase())
                .filter(Boolean),
        );
        capabilities.add(NVIDIA_GRAPHICS_CAPABILITY);
        service.environment.NVIDIA_DRIVER_CAPABILITIES = [...capabilities].join(",");
    }
    Object.assign(service.environment, NVIDIA_RENDER_ENVIRONMENT);

    service.deploy ??= {};
    service.deploy.resources ??= {};
    service.deploy.resources.reservations ??= {};
    service.deploy.resources.reservations.devices = [
        ...nonNvidiaReservations,
        {
            driver: NVIDIA_DRIVER,
            device_ids: [device.nvidiaUuid],
            capabilities: ["gpu"],
        },
    ];
}
