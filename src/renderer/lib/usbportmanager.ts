import { type Device } from "usb";
import { type Ref, ref, watch } from "vue";
import { logger, Winboat } from "./winboat";
import { WinboatConfig, type PTPortDeviceInfo } from "./config";
import { assert } from "@vueuse/core";

const { usb, getDeviceList }: typeof import("usb") = require("usb");
const { execFileSync }: typeof import("node:child_process") = require("node:child_process");
const fs: typeof import("node:fs") = require("node:fs");

type DeviceStrings = {
    manufacturer: string | null;
    product: string | null;
};

export type { PTPortDeviceInfo };

// Vendor IDs for internal/system devices that shouldn't appear in port passthrough
const INTERNAL_DEVICE_VIDS = [
    0x1d6b, // Linux Foundation (root hubs)
];

// Device classes that are typically internal
const INTERNAL_DEVICE_CLASSES = [
    0x09, // Hub
];

export class USBPortManager {
    private static instance: USBPortManager | null = null;
    devices: Ref<Device[]> = ref([]);
    ptPorts: Ref<PTPortDeviceInfo[]> = ref([]);
    // ^^ To be kept in sync with WinboatConfig.config.passedThroughPorts

    readonly #deviceStringCache: Map<string, DeviceStrings> = new Map<string, DeviceStrings>();
    readonly #winboat: Winboat = Winboat.getInstance();
    readonly #wbConfig: WinboatConfig = WinboatConfig.getInstance();

    static getInstance() {
        USBPortManager.instance ??= new USBPortManager();
        return USBPortManager.instance;
    }

    private constructor() {
        this.devices.value = getDeviceList();
        // Note: We don't pre-cache device strings here to avoid blocking the UI
        // Strings will be cached lazily when stringifyDevice is called
        this.ptPorts.value = this.#wbConfig.config.passedThroughPorts ?? [];
        this.#setupDeviceUpdateListeners();
        this.#setupGuestListener();
    }

    /**
     * Gets the host port string from a device's port numbers
     * @param device The USB device
     * @returns The host port string (e.g., "1.2.3")
     */
    getHostPort(device: Device): string {
        // portNumbers is an array like [1, 2, 3] representing the physical port path
        return device.portNumbers?.join(".") ?? "";
    }

    /**
     * Gets the unique port identifier (bus:port combination)
     * @param device The USB device
     * @returns A unique port identifier string
     */
    getPortIdentifier(device: Device): string {
        return `${device.busNumber}:${this.getHostPort(device)}`;
    }

    /**
     * Sets up listeners for USB device attach and detach events
     */
    #setupDeviceUpdateListeners() {
        usb.on("attach", async (device: Device) => {
            this.devices.value = getDeviceList();
            const busNumber = device.busNumber;
            const hostPort = this.getHostPort(device);
            const portId = `${busNumber}:${hostPort}`;

            logger.info(`[USBPortManager] USB device attached at port ${portId}`);

            const isInList = this.isPortInPassthroughList(device);
            if (this.#winboat.isOnline.value && isInList) {
                const existsInVM = await this.#QMPCheckIfPortDeviceExists(busNumber, hostPort);
                logger.info(`[USBPortManager] Port ${portId} in passthrough list, exists in VM: ${existsInVM}`);

                if (!existsInVM) {
                    logger.info(`[USBPortManager] Adding device to VM`);
                    await this.#QMPAddPortDevice(device);
                }
            }
        });

        usb.on("detach", async (device: Device) => {
            this.devices.value = getDeviceList();
            const busNumber = device.busNumber;
            const hostPort = this.getHostPort(device);
            const portId = `${busNumber}:${hostPort}`;

            logger.info(`[USBPortManager] USB device detached from port ${portId}`);

            if (this.#winboat.isOnline.value && this.isPortInPassthroughList(device)) {
                const existsInVM = await this.#QMPCheckIfPortDeviceExists(busNumber, hostPort);
                logger.info(`[USBPortManager] Port ${portId} in passthrough list, exists in VM: ${existsInVM}`);

                if (existsInVM) {
                    logger.info(`[USBPortManager] Removing device from VM`);
                    await this.#QMPRemovePortDevice(busNumber, hostPort);
                }
            }
        });
    }

    /**
     * Sets up the listener responsible for passing through devices in bulk when the guest is online
     */
    #setupGuestListener() {
        watch(this.#winboat.isOnline, async (isOnline: boolean) => {
            if (!isOnline) return;

            logger.info("[USBPortManager] Guest is online, passing through port-based devices");
            const ptPorts = this.#wbConfig.config.passedThroughPorts ?? [];

            for (const ptPort of ptPorts) {
                const device = this.getDeviceAtPort(ptPort.busNumber, ptPort.hostPort);
                if (
                    device &&
                    !(await this.#QMPCheckIfPortDeviceExists(ptPort.busNumber, ptPort.hostPort))
                ) {
                    logger.info(
                        `Port ${ptPort.busNumber}:${ptPort.hostPort} has a device, adding to VM`,
                    );
                    await this.#QMPAddPortDevice(device);
                }
            }
        });
    }

    /**
     * Gets the device currently connected at a specific port
     * @param busNumber The USB bus number
     * @param hostPort The host port path string
     * @returns The device at that port, or undefined if no device is connected
     */
    getDeviceAtPort(busNumber: number, hostPort: string): Device | undefined {
        return this.devices.value.find(
            d => d.busNumber === busNumber && this.getHostPort(d) === hostPort
        );
    }

    /**
     * Turns a USB device into a human-readable string
     * @param device The USB device to stringify
     * @returns A human-readable string representing the USB device
     */
    stringifyDevice(device: Device): string {
        const vendorIdHex = device.deviceDescriptor.idVendor.toString(16).padStart(4, "0");
        const productIdHex = device.deviceDescriptor.idProduct.toString(16).padStart(4, "0");
        const portId = this.getPortIdentifier(device);

        // Check cache first
        const cacheKey = `${vendorIdHex}:${productIdHex}`;
        if (this.#deviceStringCache.has(cacheKey)) {
            const cached = this.#deviceStringCache.get(cacheKey)!;
            return `[Bus ${device.busNumber} Port ${this.getHostPort(device)}] ${cached.manufacturer || "Unknown Vendor"} | ${
                cached.product || "Unknown Product"
            }`;
        }

        let manufacturer: string | null = null;
        let product: string | null = null;

        try {
            const deviceStrings = this.#getDeviceStringsFromLsusb(vendorIdHex, productIdHex);
            manufacturer = deviceStrings.manufacturer;
            product = deviceStrings.product;
        } catch (e) {
            logger.error(`Error fetching string descriptors for USB device ${vendorIdHex}:${productIdHex}`);
            logger.error(e);
        }

        this.#deviceStringCache.set(cacheKey, { manufacturer, product });

        return `[Bus ${device.busNumber} Port ${this.getHostPort(device)}] ${manufacturer || "Unknown Vendor"} | ${product || "Unknown Product"}`;
    }

    /**
     * Converts a port info to a human-readable string
     * @param portInfo The PTPortDeviceInfo object to stringify
     * @returns A human-readable string representing the port
     */
    stringifyPort(portInfo: PTPortDeviceInfo): string {
        const device = this.getDeviceAtPort(portInfo.busNumber, portInfo.hostPort);
        if (device) {
            return this.stringifyDevice(device);
        }
        return `[Bus ${portInfo.busNumber} Port ${portInfo.hostPort}] ${portInfo.label || "No device connected"}`;
    }

    /**
     * Retrieves the manufacturer and product strings for a USB device using the `lsusb` command
     */
    #getDeviceStringsFromLsusb(vidHex: string, pidHex: string): DeviceStrings {
        try {
            const lsusbOutput = execFileSync("lsusb", ["-d", `${vidHex}:${pidHex}`, "-v"], { encoding: "utf8" });

            const manufacturerMatch = new RegExp(/^\s*iManufacturer\s+\d+\s+(.+)$/m).exec(lsusbOutput);
            const manufacturer = manufacturerMatch ? manufacturerMatch[1].trim() : null;

            const productMatch = new RegExp(/^\s*iProduct\s+\d+\s+(.+)$/m).exec(lsusbOutput);
            const product = productMatch ? productMatch[1].trim() : null;

            return { manufacturer, product };
        } catch (error) {
            logger.error(`Failed to get device strings for ${vidHex}:${pidHex}:`, error);
            return { manufacturer: null, product: null };
        }
    }

    /**
     * Adds a USB port to the passthrough list
     * @param device The USB device currently at the port to add
     * @param label Optional label for the port (device description)
     */
    async addPortToPassthroughList(device: Device, label?: string) {
        const busNumber = device.busNumber;
        const hostPort = this.getHostPort(device);
        const portLabel = label ?? `Unknown device at Bus ${busNumber} Port ${hostPort}`;

        // Avoid duplicates
        const existingPorts = this.#wbConfig.config.passedThroughPorts ?? [];
        if (existingPorts.some(p => p.busNumber === busNumber && p.hostPort === hostPort)) {
            throw new Error(`Port Bus ${busNumber} Port ${hostPort} is already in the passthrough list`);
        }

        const portInfo: PTPortDeviceInfo = { busNumber, hostPort, label: portLabel };

        this.#wbConfig.config.passedThroughPorts = existingPorts.concat(portInfo);
        this.ptPorts.value = this.#wbConfig.config.passedThroughPorts;

        if (
            this.#winboat.isOnline.value &&
            !(await this.#QMPCheckIfPortDeviceExists(busNumber, hostPort))
        ) {
            await this.#QMPAddPortDevice(device);
        }

        logger.info(`Added port Bus ${busNumber} Port ${hostPort} to passthrough list`);
    }

    /**
     * Removes a USB port from the passthrough list
     * @param portInfo The port's PTPortDeviceInfo object to remove
     */
    async removePortFromPassthroughList(portInfo: PTPortDeviceInfo) {
        const existingPorts = this.#wbConfig.config.passedThroughPorts ?? [];
        this.#wbConfig.config.passedThroughPorts = existingPorts.filter(
            p => p.busNumber !== portInfo.busNumber || p.hostPort !== portInfo.hostPort
        );
        this.ptPorts.value = this.#wbConfig.config.passedThroughPorts;

        if (
            this.#winboat.isOnline.value &&
            (await this.#QMPCheckIfPortDeviceExists(portInfo.busNumber, portInfo.hostPort))
        ) {
            await this.#QMPRemovePortDevice(portInfo.busNumber, portInfo.hostPort);
        }

        logger.info(`Removed port Bus ${portInfo.busNumber} Port ${portInfo.hostPort} from passthrough list`);
    }

    /**
     * Determines if a USB port is in the passthrough list
     * Uses strict bus+port matching (for firmware updates where only VID/PID changes)
     * @param device The USB device to check
     * @returns A boolean indicating whether the port is in the passthrough list
     */
    isPortInPassthroughList(device: Device): boolean {
        const busNumber = device.busNumber;
        const hostPort = this.getHostPort(device);
        const existingPorts = this.#wbConfig.config.passedThroughPorts ?? [];
        return existingPorts.some(p => p.busNumber === busNumber && p.hostPort === hostPort);
    }

    /**
     * Determines if a device is likely an external/removable USB device
     * Filters out root hubs, internal hubs, and other system devices
     * Uses sysfs removable attribute when available
     * @param device The USB device to check
     * @returns A boolean indicating whether the device is likely external
     */
    isExternalDevice(device: Device): boolean {
        const vid = device.deviceDescriptor.idVendor;
        const deviceClass = device.deviceDescriptor.bDeviceClass;

        // Filter out known internal vendor IDs (root hubs)
        if (INTERNAL_DEVICE_VIDS.includes(vid)) {
            return false;
        }

        // Filter out hubs and other internal device classes
        if (INTERNAL_DEVICE_CLASSES.includes(deviceClass)) {
            return false;
        }

        // Check sysfs removable attribute for more accurate detection
        // Path format: /sys/bus/usb/devices/{bus}-{port}/removable
        const portPath = device.portNumbers?.join(".") ?? "";
        if (portPath) {
            const sysfsPath = `/sys/bus/usb/devices/${device.busNumber}-${portPath}/removable`;
            try {
                const removable = fs.readFileSync(sysfsPath, "utf8").trim();
                // "removable" = external port, "fixed" = internal, "unknown" = can't determine
                if (removable === "fixed") {
                    return false;
                }
            } catch {
                // Sysfs path doesn't exist or can't be read, fall through to default
            }
        }

        return true;
    }

    /**
     * Determines if a port has a device connected
     * @param portInfo The PTPortDeviceInfo object to check
     * @returns A boolean indicating whether the port has a device connected
     */
    isPortDeviceConnected(portInfo: PTPortDeviceInfo): boolean {
        return this.devices.value.some(
            d => d.busNumber === portInfo.busNumber && this.getHostPort(d) === portInfo.hostPort
        );
    }

    /**
     * Removes all passed through ports from the passthrough list
     */
    async removeAllPassthroughPortsAndConfig() {
        for (const port of this.ptPorts.value) {
            await this.removePortFromPassthroughList(port);
        }
        this.#wbConfig.config.passedThroughPorts = [];
        this.ptPorts.value = [];
    }

    /**
     * Generates a unique ID for QMP device management
     */
    #getQMPDeviceId(busNumber: number, hostPort: string): string {
        // Replace dots with underscores for valid ID
        return `port_${busNumber}_${hostPort.replace(/\./g, "_")}`;
    }

    async #QMPCheckIfPortDeviceExists(busNumber: number, hostPort: string): Promise<boolean> {
        let response = null;
        const deviceId = this.#getQMPDeviceId(busNumber, hostPort);
        try {
            response = await this.#winboat.qmpMgr!.executeCommand("human-monitor-command", {
                "command-line": "info qtree",
            });
            assert("result" in response);

            // @ts-ignore property "result" already exists due to assert
            return response.return.includes(`usb-host, id "${deviceId}"`);
        } catch (e) {
            logger.error(`There was an error checking whether USB port device '${busNumber}:${hostPort}' exists`);
            logger.error(e);
            logger.error(`QMP response: ${JSON.stringify(response)}`);
        }
        return false;
    }

    async #QMPAddPortDevice(device: Device) {
        let response = null;
        const busNumber = device.busNumber;
        const hostPort = this.getHostPort(device);
        const deviceId = this.#getQMPDeviceId(busNumber, hostPort);
        const deviceBusPath = `/dev/bus/usb/${String(device.busNumber).padStart(3, "0")}/${String(
            device.deviceAddress,
        ).padStart(3, "0")}`;

        // Try to free MTP device if needed
        try {
            execFileSync("fuser", ["-k", deviceBusPath], { encoding: "utf8" });
        } catch {
            // Device doesn't need freeing or couldn't be freed
        }

        try {
            response = await this.#winboat.qmpMgr!.executeCommand("device_add", {
                driver: "usb-host",
                id: deviceId,
                hostdevice: deviceBusPath,
            });

            logger.info(`[USBPortManager] QMP device_add response: ${JSON.stringify(response)}`);

            if ("error" in response) {
                logger.error(`[USBPortManager] QMP error: ${JSON.stringify(response)}`);
            }
        } catch (e) {
            logger.error(`[USBPortManager] Error adding USB port device '${busNumber}:${hostPort}'`);
            logger.error(e);
            logger.error(`[USBPortManager] QMP response: ${JSON.stringify(response)}`);
        }
        logger.info(`[USBPortManager] QMPAddPortDevice id=${deviceId} device=${deviceBusPath}`);
    }

    async #QMPRemovePortDevice(busNumber: number, hostPort: string) {
        let response = null;
        const deviceId = this.#getQMPDeviceId(busNumber, hostPort);
        try {
            response = await this.#winboat.qmpMgr!.executeCommand("device_del", { id: deviceId });
            assert("result" in response);
        } catch (e) {
            logger.error(`There was an error removing USB port device '${busNumber}:${hostPort}'`);
            logger.error(e);
            logger.error(`QMP response: ${JSON.stringify(response)}`);
        }
        logger.info("QMPRemovePortDevice", busNumber, hostPort);
    }
}
