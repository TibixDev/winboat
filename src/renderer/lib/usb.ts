import assert from "assert";
import type { USBDevice } from "../../types";
const { exec }: typeof import('child_process') = require('child_process');
const { promisify }: typeof import('util') = require('util');
const execAsync = promisify(exec);

/**
 * Parses a single line of `lsusb` output into a `USBDevice` object.
 */
function parseLSUSBLine(line: string): USBDevice {
    // we can get rid of the bus data as we don't need it for our usecase
    const usbData = line.split("ID")[1];

    // these "magic numbers" are slicing ` xxxx:xxxx` into two strings, ignoring the whitespace and colon
    return {
        vendorID: usbData.slice(1, 5),
        productID: usbData.slice(6, 10),
        alias: usbData.slice(11)
    };
}

/** 
 * The docker arguments field of the compose file includes newline separated parameters supplied to our container like so:
    ```yaml
    ARGUMENTS: |
        -device usb-host,vendorid=0xYYYYproductid=0xYYYY
        <some other irrelevant arguments may be here>
        -device usb-host,vendorid=0xYYYY,productid=0xYYYY
        <...>
    ```
    This function takes the newline separated argument list, parses it accordingly, and returns an array of `USBDevice` objects.
*/
export async function extractUSBFromDockerArgs(dockerArgs: string): Promise<USBDevice[]> {
    const usbDevices = [];

    for (const argument of dockerArgs.trimEnd().split("\n")) {
        if (!argument.includes("usb-host")) continue;

        // After the parameters to the '-device' argument are separated by commas. 
        // Luckily, we can ignore the first one since we interested only in the vendor and product ID's
        const params = argument.split(",");

        // The values supplied to the parameters are supplied after the '=' sign so we can split by that and get the second element.
        // We need to ignore the prefixing '0x', hence the splice(2)
        const vendorID = params[1].split("=")[1].slice(2);
        const productID = params[2].split("=")[1].slice(2);

        // we need to invoke lsusb here to fetch the alias as well
        try {
            const rawUsbData = (await execAsync(`lsusb -d ${vendorID}:${productID}`)).stdout?.trimEnd();

            // TODO: handle multiple USB devices with the same product and vendor ID's
            usbDevices.push(parseLSUSBLine(rawUsbData.split("\n")[0]));
        } catch (e) {
            console.error(`Failed to fetch info about USB device ${vendorID}:${productID}`);
            console.error(e);
            usbDevices.push({
                vendorID,
                productID,
                alias: `USB Device ${vendorID}:${productID}`
            })
        }
    }

    return usbDevices;
}

type USBDeviceFetchOptions = {
    ignoreVendorIDs: Array<string>
}

export async function fetchUSBDevices(options?: USBDeviceFetchOptions): Promise<USBDevice[]> {
    const rawUsbData = (await execAsync("lsusb")).stdout.trimEnd();
    const rawUsbDevices = rawUsbData.split("\n")
    const usbDevices = [];
    for (const rawDeviceData of rawUsbDevices) {
        const currentDevice = parseLSUSBLine(rawDeviceData);
        const ignoreList = options?.ignoreVendorIDs ?? [];

        if (!ignoreList.includes(currentDevice.vendorID)) {
            usbDevices.push(currentDevice);
        }
    }

    return usbDevices;
} 

/**
 * Serializes an array of `USBDevice` objects into dockur's argument format to be used in the docker compose file
 */
export function serializeUSBDevices(devices: USBDevice[]): string {
    let serializedString = "";
    for (const device of devices) {
        serializedString += `-device usb-host,vendorid=0x${device.vendorID},productid=0x${device.productID}\n`;
    }

    return serializedString;
}