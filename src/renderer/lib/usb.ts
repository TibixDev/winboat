const { exec }: typeof import('child_process') = require('child_process');
const { promisify }: typeof import('util') = require('util');
const execAsync = promisify(exec);

type USBDevice = {
    vendorID: string,
    productID: string,
    alias: string
};

export async function fetchUSBDevices(options?: { ignoreVendorIDs: Array<string> }): Promise<USBDevice[]> {
    const rawUsbData = (await execAsync("lsusb")).stdout.trimEnd();
    const rawUsbDevices = rawUsbData.split("\n").map(x => x.split("ID")[1]) // we can get rid of the bus data as we don't need it for our usecase
    const usbDevices = [];
    for(const rawDeviceData of rawUsbDevices) {
        // these "magic numbers" are slicing ` xxxx:xxxx` into two strings, ignoring the whitespace and colon
        const vendorID = rawDeviceData.slice(1, 5);
        const productID = rawDeviceData.slice(6, 10);
        const alias = rawDeviceData.slice(11);

        if(!(options ?? { ignoreVendorIDs:[]})?.ignoreVendorIDs.includes(vendorID))
            usbDevices.push({ vendorID, productID, alias });
    }

    return usbDevices;
} 