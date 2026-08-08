import { describe, expect, it } from "bun:test";
import type { ComposeConfig } from "../src/types";
import { configureGpuContainer, gpuContainerConfigNeedsUpdate } from "../src/renderer/lib/gpu-container";
import {
    nvidiaCdiSpecProvidesGpu,
    shouldCheckNvidiaContainerSupport,
    type RenderDevice,
} from "../src/renderer/lib/gpu";

function makeService(): ComposeConfig["services"]["windows"] {
    return {
        image: "example.invalid/windows",
        container_name: "WinBoat",
        environment: {
            VERSION: "11",
            RAM_SIZE: "4G",
            CPU_CORES: "4",
            DISK_SIZE: "64G",
            USERNAME: "winboat",
            PASSWORD: "password",
            HOME: "/home/user",
            LANGUAGE: "English",
            ARGUMENTS: "",
            HOST_PORTS: "",
        },
        ports: [],
        cap_add: [],
        stop_grace_period: "120s",
        restart: "no",
        volumes: [],
        devices: [],
    };
}

const nvidiaDevice: RenderDevice = {
    path: "/dev/dri/renderD128",
    name: "NVIDIA GPU",
    driver: "nvidia",
    nvidiaUuid: "GPU-11111111-2222-3333-4444-555555555555",
};

const intelDevice: RenderDevice = {
    path: "/dev/dri/renderD129",
    name: "Intel GPU",
    driver: "i915",
};

describe("GPU container configuration", () => {
    it("requests the exact NVIDIA GPU and graphics driver libraries", () => {
        const service = makeService();
        service.environment.GBM_BACKENDS_PATH = "/host/distro/specific/gbm";

        expect(gpuContainerConfigNeedsUpdate(service, nvidiaDevice)).toBe(true);

        configureGpuContainer(service, nvidiaDevice);

        expect(service.environment.NVIDIA_DRIVER_CAPABILITIES).toBe("graphics");
        expect(service.environment).toMatchObject({
            __NV_PRIME_RENDER_OFFLOAD: "1",
            __EGL_VENDOR_LIBRARY_FILENAMES: "/usr/share/glvnd/egl_vendor.d/10_nvidia.json",
            __GLX_VENDOR_LIBRARY_NAME: "nvidia",
            __VK_LAYER_NV_optimus: "NVIDIA_only",
            VK_ICD_FILENAMES: "/etc/vulkan/icd.d/nvidia_icd.json",
            GBM_BACKEND: "nvidia-drm",
        });
        expect(service.environment.GBM_BACKENDS_PATH).toBeUndefined();
        expect(service.deploy?.resources?.reservations?.devices).toEqual([
            {
                driver: "nvidia",
                device_ids: [nvidiaDevice.nvidiaUuid!],
                capabilities: ["gpu"],
            },
        ]);
        expect(gpuContainerConfigNeedsUpdate(service, nvidiaDevice)).toBe(false);
    });

    it("removes NVIDIA-only settings when switching to another render device", () => {
        const service = makeService();
        service.deploy = {
            resources: {
                reservations: {
                    devices: [{ driver: "example", count: 1, capabilities: ["gpu"] }],
                },
            },
        };
        configureGpuContainer(service, nvidiaDevice);

        configureGpuContainer(service, intelDevice);

        expect(service.environment.NVIDIA_DRIVER_CAPABILITIES).toBeUndefined();
        expect(service.environment.GBM_BACKEND).toBeUndefined();
        expect(service.environment.__EGL_VENDOR_LIBRARY_FILENAMES).toBeUndefined();
        expect(service.environment.VK_ICD_FILENAMES).toBeUndefined();
        expect(service.deploy?.resources?.reservations?.devices).toEqual([
            { driver: "example", count: 1, capabilities: ["gpu"] },
        ]);
        expect(gpuContainerConfigNeedsUpdate(service, intelDevice)).toBe(false);
    });

    it("rejects a proprietary NVIDIA render node without an exact GPU UUID", () => {
        const service = makeService();

        expect(() => configureGpuContainer(service, { ...nvidiaDevice, nvidiaUuid: undefined })).toThrow(
            "Could not map /dev/dri/renderD128 to an NVIDIA GPU UUID through nvidia-smi.",
        );
    });
});

describe("NVIDIA CDI detection", () => {
    const cdiSpec = `
cdiVersion: 0.6.0
kind: nvidia.com/gpu
devices:
  - name: GPU-11111111-2222-3333-4444-555555555555
  - name: GPU-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
`;

    it("recognizes the exact GPU exposed by an NVIDIA CDI spec", () => {
        expect(nvidiaCdiSpecProvidesGpu(cdiSpec, nvidiaDevice.nvidiaUuid)).toBe(true);
        expect(nvidiaCdiSpecProvidesGpu(cdiSpec, "GPU-missing")).toBe(false);
    });

    it("rejects another CDI kind and malformed YAML", () => {
        expect(nvidiaCdiSpecProvidesGpu(cdiSpec.replace("nvidia.com/gpu", "vendor.example/gpu"))).toBe(false);
        expect(nvidiaCdiSpecProvidesGpu("kind: [")).toBe(false);
    });
});

describe("NVIDIA Container Toolkit gate", () => {
    it("checks only when GPU acceleration and a proprietary NVIDIA device are both selected", () => {
        expect(shouldCheckNvidiaContainerSupport(true, nvidiaDevice)).toBe(true);
        expect(shouldCheckNvidiaContainerSupport(false, nvidiaDevice)).toBe(false);
        expect(shouldCheckNvidiaContainerSupport(true, intelDevice)).toBe(false);
    });
});
