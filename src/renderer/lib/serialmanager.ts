import { ref, type Ref } from "vue";
import { DosboatConfig } from "./config";

const fs: typeof import("node:fs") = require("node:fs");
const path: typeof import("node:path") = require("node:path");

export type SerialPortInfo = {
    path: string;        // e.g. "/dev/ttyS0", "/dev/ttyUSB0"
    name: string;        // e.g. "ttyS0", "ttyUSB0" 
    type: "native" | "usb-serial";  // native RS-232 vs USB-to-serial adapter
    description: string; // Human-readable description from sysfs
    vendorId?: string;   // USB VID for USB-serial adapters
    productId?: string;  // USB PID for USB-serial adapters
};

export class SerialManager {
    private static instance: SerialManager | null = null;
    
    /** All detected serial ports on the host */
    availablePorts: Ref<SerialPortInfo[]> = ref([]);
    
    /** Ports currently selected for passthrough */
    passedThroughPorts: Ref<string[]> = ref([]);

    static getInstance() {
        SerialManager.instance ??= new SerialManager();
        return SerialManager.instance;
    }

    private constructor() {
        this.refreshPorts();
        // Load persisted passthrough config
        const config = DosboatConfig.getInstance();
        this.passedThroughPorts.value = config.config.serialPorts ?? [];
    }

    /**
     * Scans /dev for serial ports: ttyS*, ttyUSB*, ttyACM*
     * Also reads sysfs for device metadata
     */
    refreshPorts(): void {
        const prefixes = ["ttyS", "ttyUSB", "ttyACM"];
        const ports: SerialPortInfo[] = [];

        for (const prefix of prefixes) {
            try {
                const entries = fs.readdirSync("/dev").filter((e: string) => e.startsWith(prefix));
                for (const entry of entries) {
                    const fullPath = `/dev/${entry}`;
                    
                    // For ttyS*, check if there's actual hardware behind it
                    // by reading /sys/class/tty/<name>/type
                    if (prefix === "ttyS") {
                        try {
                            const typeVal = fs.readFileSync(`/sys/class/tty/${entry}/type`, "utf-8").trim();
                            // type "0" means no hardware present
                            if (typeVal === "0") continue;
                        } catch {
                            continue; // Can't verify hardware, skip
                        }
                    }

                    const isUsb = prefix === "ttyUSB" || prefix === "ttyACM";
                    const info: SerialPortInfo = {
                        path: fullPath,
                        name: entry,
                        type: isUsb ? "usb-serial" : "native",
                        description: this.getDescription(entry),
                    };

                    if (isUsb) {
                        const usbInfo = this.getUsbInfo(entry);
                        info.vendorId = usbInfo.vendorId;
                        info.productId = usbInfo.productId;
                    }

                    ports.push(info);
                }
            } catch {
                // /dev may not have these entries
            }
        }

        this.availablePorts.value = ports;
    }

    private getDescription(ttyName: string): string {
        try {
            const driverLink = fs.readlinkSync(`/sys/class/tty/${ttyName}/device/driver`);
            return path.basename(driverLink);
        } catch {
            return "Serial Port";
        }
    }

    private getUsbInfo(ttyName: string): { vendorId?: string; productId?: string } {
        try {
            const devicePath = fs.realpathSync(`/sys/class/tty/${ttyName}/device`);
            // Walk up to find the USB device directory with idVendor/idProduct
            let current = devicePath;
            for (let i = 0; i < 5; i++) {
                const vidPath = path.join(current, "idVendor");
                const pidPath = path.join(current, "idProduct");
                if (fs.existsSync(vidPath) && fs.existsSync(pidPath)) {
                    return {
                        vendorId: fs.readFileSync(vidPath, "utf-8").trim(),
                        productId: fs.readFileSync(pidPath, "utf-8").trim(),
                    };
                }
                current = path.dirname(current);
            }
        } catch { /* ignore */ }
        return {};
    }

    addPort(portPath: string): void {
        if (!this.passedThroughPorts.value.includes(portPath)) {
            this.passedThroughPorts.value.push(portPath);
            this.persistConfig();
        }
    }

    removePort(portPath: string): void {
        this.passedThroughPorts.value = this.passedThroughPorts.value.filter(p => p !== portPath);
        this.persistConfig();
    }

    isPortPassedThrough(portPath: string): boolean {
        return this.passedThroughPorts.value.includes(portPath);
    }

    /**
     * Generates QEMU -chardev/-device argument pairs for all passed-through serial ports.
     * These get appended to the ARGUMENTS environment variable in the compose config.
     * Each port becomes a COM port inside FreeDOS (COM1, COM2, etc.)
     */
    generateQemuSerialArgs(): string {
        return this.passedThroughPorts.value
            .map((portPath, index) => {
                const id = `hostserial${index}`;
                return `-chardev serial,id=${id},path=${portPath} -device isa-serial,chardev=${id}`;
            })
            .join(" ");
    }

    /**
     * Returns Docker device mappings for all passed-through serial ports.
     * e.g., ["/dev/ttyS0:/dev/ttyS0", "/dev/ttyUSB0:/dev/ttyUSB0"]
     */
    getDeviceMappings(): string[] {
        return this.passedThroughPorts.value.map(p => `${p}:${p}`);
    }

    private persistConfig(): void {
        const config = DosboatConfig.getInstance();
        config.config.serialPorts = [...this.passedThroughPorts.value];
    }
}
