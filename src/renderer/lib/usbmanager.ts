const { usb, getDeviceList }: typeof import("usb") = require("usb");
const fs: typeof import("fs") = require("fs");
const  { execSync }: typeof import('child_process') = require('child_process');
import { type Device } from "usb";
import { type Ref, ref, watch } from "vue";
import { Winboat, logger } from "./winboat";
import { WinboatConfig } from "./config";
import { QMPManager } from "./qmp";
import { assert } from "@vueuse/core";

const LINUX_DEVICE_DATABASE_PATH = "/usr/share/hwdata/usb.ids";

type LinuxDeviceDatabase = Record<string, { name: string; devices: Record<string, string> }>;

type DeviceStrings = {
    // Manufacturer or Vendor string
    manufacturer: string | null;
    // Product string
    product: string | null;
}

export type PTSerializableDeviceInfo = {
    // USB Vendor ID
    vendorId: number
    // USB Product ID;
    productId: number;
} & DeviceStrings;

export class USBManager {
    private static instance: USBManager;
    // Current list of USB devices
    devices: Ref<Device[]> = ref([]);
    // Current list of passed-through USB devices
    ptDevices: Ref<PTSerializableDeviceInfo[]> = ref([]);
    // ^^ To be kept in sync with WinboatConfig.config.passedThroughDevices

    #linuxDeviceDatabase: LinuxDeviceDatabase = {};
    #deviceStringCache: Map<string, DeviceStrings> = new Map<string, DeviceStrings>();
    #winboat: Winboat = new Winboat()
    #wbConfig: WinboatConfig = new WinboatConfig()

    constructor() {
        if (USBManager.instance) {
            return USBManager.instance;
        }

        this.#linuxDeviceDatabase = readLinuxDeviceDatabase(LINUX_DEVICE_DATABASE_PATH);
        this.devices.value = getDeviceList();
        // Pre-cache existing devices, otherwise on detach we won't have any info about them
        // if they are not in the database
        this.devices.value.forEach(d => this.stringifyDevice(d));
        this.ptDevices.value = this.#wbConfig.config.passedThroughDevices;
        this.#setupDeviceUpdateListeners();
        this.#setupGuestListener();

        USBManager.instance = this;

        return USBManager.instance;
    }

    /**
     * Sets up listeners for USB device attach and detach events
     */
    #setupDeviceUpdateListeners() {
        usb.on("attach", async (device: Device) => {
            this.devices.value = getDeviceList();
            logger.info(`USB device attached: ${this.stringifyDevice(device)}`);
            if (
                    this.#winboat.isOnline.value &&
                    this.isDeviceInPassthroughList(device) &&
                    !await QMPCheckIfDeviceExists(this.#winboat.qmpMgr!, device.deviceDescriptor.idVendor, device.deviceDescriptor.idProduct)
            ) {
                logger.info(`Device is in passthrough list, adding to VM: ${this.stringifyDevice(device)}`);   
                await QMPAddDevice(this.#winboat.qmpMgr!, device.deviceDescriptor.idVendor, device.deviceDescriptor.idProduct);
            }
        });

        usb.on("detach", async (device: Device) => {
            this.devices.value = getDeviceList();

            logger.info(`USB device detached: ${this.stringifyDevice(device)}`);
            if (
                this.#winboat.isOnline.value &&
                this.isDeviceInPassthroughList(device) &&
                await QMPCheckIfDeviceExists(this.#winboat.qmpMgr!, device.deviceDescriptor.idVendor, device.deviceDescriptor.idProduct)
            ) {
                logger.info(`Device is in passthrough list, removing from VM: ${this.stringifyDevice(device)}`);
                await QMPRemoveDevice(this.#winboat.qmpMgr!, device.deviceDescriptor.idVendor, device.deviceDescriptor.idProduct);
            }
        });
    }

    /**
     * Sets up the listener responsible for passing through devices in bulk when the guest is online
     */
    #setupGuestListener() {
        watch(this.#winboat.isOnline, async (isOnline: boolean) => {
            if (!isOnline) return;

            logger.info("Guest is online, passing through devices");
            // Pass through any devices that are in the passthrough list & connected
            for (const ptDevice of this.#wbConfig.config.passedThroughDevices) {
                if (this.isPTDeviceConnected(ptDevice) && !(await QMPCheckIfDeviceExists(this.#winboat.qmpMgr!, ptDevice.vendorId, ptDevice.productId))) {
                    logger.info(`Pass-through device ${this.stringifyPTSerializableDevice(ptDevice)} is connected, adding to VM`);
                    await QMPAddDevice(this.#winboat.qmpMgr!, ptDevice.vendorId, ptDevice.productId);
                }
            }
        });
    }

    /**
     * Turns a USB device into a human-readable string
     * @param device The USB device to stringify
     * @returns A human-readable string representing the USB device
     */
    stringifyDevice(device: Device): string {
        const vendorIdHex = device.deviceDescriptor.idVendor.toString(16).padStart(4, "0");
        const productIdHex = device.deviceDescriptor.idProduct.toString(16).padStart(4, "0");

        // Check cache first
        const cacheKey = `${vendorIdHex}:${productIdHex}`;
        if (this.#deviceStringCache.has(cacheKey)) {
            const cached = this.#deviceStringCache.get(cacheKey)!;
            return `[${vendorIdHex}:${productIdHex}] ${cached.manufacturer || "Unknown Vendor"} | ${cached.product || "Unknown Product"}`;
        }

        let vendor = this.#linuxDeviceDatabase[vendorIdHex];
        let product = vendor?.devices[productIdHex];
        
        // Many devices are not included in the database, but the device itself may have string descriptors
        // Unfortunately, we don't seem to have permission to open the devices directly to read the string descriptors
        // directly through the USB library, so we have to use lsusb as a fallback
        try {
            if (!product) {
                const deviceStrings = getDeviceStringsFromLsusb(vendorIdHex, productIdHex);
                product = deviceStrings.product!;
            }
    
            if (!vendor?.name) {
                const deviceStrings = getDeviceStringsFromLsusb(vendorIdHex, productIdHex);
    
                if (deviceStrings.manufacturer) {
                    vendor = { name: deviceStrings.manufacturer!, devices: {} };
                }
            }
        } catch(e) {
            logger.error(`Error fetching string descriptors for USB device ${vendorIdHex}:${productIdHex}`);
            logger.error(e);
        }

        this.#deviceStringCache.set(`${vendorIdHex}:${productIdHex}`, { manufacturer: vendor?.name || null, product: product || null });

        // Format: [VID:PID] Vendor Name | Product Name
        return `[${vendorIdHex}:${productIdHex}] ${vendor ? vendor.name : "Unknown Vendor"} | ${product ? product : "Unknown Product"}`;
    }

    /**
     * Converts a pass-through serializable device info object to a human-readable string
     * @param device The PTSerializableDeviceInfo object to stringify
     * @returns A human-readable string representing the USB device
     */
    stringifyPTSerializableDevice(device: PTSerializableDeviceInfo): string {
        const vendorIdHex = device.vendorId.toString(16).padStart(4, "0");
        const productIdHex = device.productId.toString(16).padStart(4, "0");

        // Format: [VID:PID] Vendor Name | Product Name
        return `[${vendorIdHex}:${productIdHex}] ${device.manufacturer || "Unknown Vendor"} | ${device.product || "Unknown Product"}`;
    }

    /**
     * Converts a USB device to a pass-through serializable device info object
     * @param device The USB device to convert
     * @returns A PTSerializableDeviceInfo object representing the USB device
     */
    #convertDeviceToPTSerializable(device: Device): PTSerializableDeviceInfo {
        const productIdHex = device.deviceDescriptor.idProduct.toString(16).padStart(4, "0");
        const vendorIdHex = device.deviceDescriptor.idVendor.toString(16).padStart(4, "0");

        const deviceStrings = this.#deviceStringCache.get(`${vendorIdHex}:${productIdHex}`);

        if (!deviceStrings) {
            throw new Error(`Device strings for device ${vendorIdHex}:${productIdHex} not found in cache.\
                Make sure to call stringifyDevice() at least once before converting.`);
        }

        return {
            vendorId: device.deviceDescriptor.idVendor,
            productId: device.deviceDescriptor.idProduct,
            ...this.#deviceStringCache.get(`${vendorIdHex}:${productIdHex}`)!,
        }
    }

    /**
     * Adds a USB device to the passthrough list
     * @param device The USB device to add
     */
    async addDeviceToPassthroughList(device: Device) {
        const ptDevice = this.#convertDeviceToPTSerializable(device);

        // Avoid duplicates
        if (this.#wbConfig.config.passedThroughDevices.find(
            d => d.vendorId === ptDevice.vendorId && d.productId === ptDevice.productId)
        ) {
            throw new Error(`Device "${ptDevice.manufacturer} | ${ptDevice.product}" is already in the passthrough list`);
        }

        console.info('[Add] Debug', this.ptDevices.value);
        // Push doesn't properly track reactivity, so we use concat instead
        this.#wbConfig.config.passedThroughDevices =
            this.#wbConfig.config.passedThroughDevices.concat(ptDevice);
        this.ptDevices.value = this.#wbConfig.config.passedThroughDevices;
        console.info('[Add] Debug 2', this.ptDevices.value);

        if (this.#winboat.isOnline.value && !await QMPCheckIfDeviceExists(this.#winboat.qmpMgr!, ptDevice.vendorId, ptDevice.productId)) {
            await QMPAddDevice(this.#winboat.qmpMgr!, ptDevice.vendorId, ptDevice.productId);
        }

        logger.info(`Added device "${ptDevice.manufacturer} | ${ptDevice.product}" to passthrough list`);
    }

    /**
     * Removes a USB device from the passthrough list
     * @param ptDevice The device's PTSerializableDeviceInfo object to remove
     */
    async removeDeviceFromPassthroughList(ptDevice: PTSerializableDeviceInfo) {
        console.info('[Remove] Debug', this.ptDevices.value);
        this.#wbConfig.config.passedThroughDevices = this.#wbConfig.config.passedThroughDevices.filter(
            d => d.vendorId !== ptDevice.vendorId || d.productId !== ptDevice.productId
        );
        this.ptDevices.value = this.#wbConfig.config.passedThroughDevices;
        console.info('[Remove] Debug 2', this.ptDevices.value);

        if (this.#winboat.isOnline.value && await QMPCheckIfDeviceExists(this.#winboat.qmpMgr!, ptDevice.vendorId, ptDevice.productId)) {
            await QMPRemoveDevice(this.#winboat.qmpMgr!, ptDevice.vendorId, ptDevice.productId);
        }

        logger.info(`Removed device "${ptDevice.manufacturer} | ${ptDevice.product}" from passthrough list`);
    }

    /**
     * Determines if a USB device is in the passthrough list
     * @param device The USB device to check
     * @returns A boolean indicating whether the device is in the passthrough list
     */
    isDeviceInPassthroughList(device: Device): boolean {
        const ptDevice = this.#convertDeviceToPTSerializable(device);
        return this.#wbConfig.config.passedThroughDevices.some(d => d.vendorId === ptDevice.vendorId && d.productId === ptDevice.productId);
    }

    /**
     * Determines if a pass-through device is connected
     * @param ptDevice The PTSerializableDeviceInfo object to check
     * @returns A boolean indicating whether the device is connected
     */
    isPTDeviceConnected(ptDevice: PTSerializableDeviceInfo): boolean {
        return this.devices.value.some(d =>
            d.deviceDescriptor.idVendor === ptDevice.vendorId &&
            d.deviceDescriptor.idProduct === ptDevice.productId
        );
    }
}

new USBManager();

/**
 * Reads the Linux USB device database from the specified file path and returns a JSON representation.
 * @param filePath Path to the usb.ids file
 * @returns A JSON object representing the USB device database
 */
function readLinuxDeviceDatabase(filePath: string): LinuxDeviceDatabase {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    const vendors: LinuxDeviceDatabase = {};
    let currentVendor = null;

    for (const line of lines) {
        if (line.startsWith("#") || line.trim() === "") continue;

        if (line[0] !== "\t") {
            // Vendor line
            const match = line.match(/^([0-9a-f]{4})\s+(.+)$/i);
            if (match) {
                currentVendor = match[1].toLowerCase();
                vendors[currentVendor] = {
                    name: match[2].trim(),
                    devices: {},
                };
            }
        } else if (line[0] === "\t" && line[1] !== "\t") {
            // Device line
            const match = line.match(/^\t([0-9a-f]{4})\s+(.+)$/i);
            if (match && currentVendor) {
                vendors[currentVendor].devices[match[1].toLowerCase()] = match[2].trim();
            }
        }
    }

    return vendors;
}

/**
 * Retrieves the manufacturer and product strings for a USB device using the `lsusb` command.
 * @param vidHex The vendor ID in hexadecimal format (4 characters, e.g. "1a2b")
 * @param pidHex The product ID in hexadecimal format (4 characters, e.g. "1a2b")
 * @returns An object containing the manufacturer and product strings (nulled fields if not found)
 */
function getDeviceStringsFromLsusb(vidHex: string, pidHex: string): DeviceStrings {
    try {
        // Run lsusb -v for the specific device, suppress stderr
        const lsusbOutput = execSync(
            `lsusb -d ${vidHex}:${pidHex} -v 2>/dev/null`,
            { encoding: 'utf8' }
        );
        
        // Parse manufacturer string
        const manufacturerMatch = lsusbOutput.match(/^\s*iManufacturer\s+\d+\s+(.+)$/m);
        const manufacturer = manufacturerMatch ? manufacturerMatch[1].trim() : null;
        
        // Parse product string
        const productMatch = lsusbOutput.match(/^\s*iProduct\s+\d+\s+(.+)$/m);
        const product = productMatch ? productMatch[1].trim() : null;
        
        return { manufacturer, product };
    } catch (error) {
        // lsusb failed (device not found, no permissions, etc.)
        logger.error(`Failed to get device strings for ${vidHex}:${pidHex}:`, error);
        return { manufacturer: null, product: null };
    }
}


async function QMPCheckIfDeviceExists(qmpConn: QMPManager, vendorId: number, productId: number): Promise<boolean> {
    let response = null;
    try {
        response = await qmpConn.executeCommand("human-monitor-command", {"command-line": "info qtree"})
        assert("result" in response);
        // @ts-ignore property "result" already exists due to assert
        return response.return.includes(`usb-host, id "${vendorId}:${productId}"`);
    } catch(e) {
        logger.error(`There was an error checking whether USB device '${vendorId}:${productId}' exists`);
        logger.error(e);
        logger.error(`QMP response: ${response}`);
    }
    return false;
}

// TODO: handle hostaddr/hostbus
async function QMPAddDevice(qmpConn: QMPManager, vendorId: number, productId: number) {
    let response = null;
    try {
        response = await qmpConn.executeCommand("device_add", {
            driver: "usb-host",
            id: `${vendorId}:${productId}`, // TODO: get rid of this
            vendorid: vendorId,
            productid: productId,
        });
        assert("result" in response);
    } catch(e) {
        logger.error(`There was an error adding USB device '${vendorId}:${productId}'`);
        logger.error(e);
        logger.error(`QMP response: ${response}`);
    }
    logger.info("QMPAddDevice", vendorId, productId);
}

async function QMPRemoveDevice(qmpConn: QMPManager, vendorId: number, productId: number) {
    let response = null;
    try {
        response = await qmpConn.executeCommand("device_del", { id: `${vendorId}:${productId}`});
        assert("result" in response);
    } catch(e) {
        logger.error(`There was an error removing USB device '${vendorId}:${productId}'`);
        logger.error(e);
        logger.error(`QMP response: ${response}`);
    }
    logger.info("QMPRemoveDevice", vendorId, productId);
}