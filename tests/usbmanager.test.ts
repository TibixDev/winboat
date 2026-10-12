import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

function fixture() {
    const usb = new EventEmitter();
    const watchers: Function[] = [];
    const logs: unknown[][] = [];
    const commands: { command: string; args: any }[] = [];
    const attached = new Set<string>();
    const config = { passedThroughDevices: [] as any[] };
    const device = { deviceDescriptor: { idVendor: 43981, idProduct: 4660 }, busNumber: 1, deviceAddress: 6 };
    let failure: string | null = null;
    const winboat = {
        isOnline: { value: true },
        qmpMgr: {
            async executeCommand(command: string, args: any) {
                commands.push({ command, args });
                if (command === "human-monitor-command") {
                    return { return: [...attached].map(id => `dev: usb-host, id "${id}"`).join("\n") };
                }
                if (failure) return { error: { class: "GenericError", desc: failure } };
                if (command === "device_add") {
                    if (!/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(args.id)) {
                        return { error: { class: "GenericError", desc: "Invalid device ID" } };
                    }
                    if (attached.has(args.id)) return { error: { class: "GenericError", desc: "Duplicate ID" } };
                    attached.add(args.id);
                }
                if (command === "device_del") attached.delete(args.id);
                return { return: {} };
            },
        },
    };
    let source = readFileSync(new URL("../src/renderer/lib/usbmanager.ts", import.meta.url), "utf8");
    source = source.replace(/^import .*;\n/gm, "").replace(/^export /gm, "");
    const logger = Object.fromEntries(
        ["info", "error", "warn"].map(level => [level, (...args: unknown[]) => logs.push([level, ...args])]),
    );
    const context = {
        Winboat: { getInstance: () => winboat },
        WinboatConfig: { getInstance: () => ({ config }) },
        logger,
        ref: (value: unknown) => ({ value }),
        watch: (_: unknown, fn: Function) => watchers.push(fn),
        // The original implementation imported VueUse's non-throwing assert.
        // The fixed implementation loads Node's assertion through require below.
        assert: () => {},
        require: (name: string) => {
            if (name === "node:assert/strict") return assert;
            if (name === "usb") return { usb, getDeviceList: () => [device] };
            if (name === "node:fs")
                return { existsSync: () => true, readFileSync: () => "abcd  LogiLink\n\t1234  UDisk flash drive" };
            if (name === "node:child_process") return { execFileSync: () => "" };
            if (name === "@electron/remote") return { app: { isPackaged: true } };
            if (name === "node:path") return { join: (...args: string[]) => args.join("/") };
            throw new Error(`Unexpected dependency: ${name}`);
        },
    };
    const manager = runInNewContext(stripTypeScriptTypes(source) + "\nUSBManager.getInstance()", context);
    return {
        manager,
        device,
        config,
        commands,
        attached,
        logs,
        watchers,
        usb,
        fail: (message: string) => {
            failure = message;
        },
    };
}

test("adding a selected USB device attaches it with a valid QEMU ID and current host path", async () => {
    const f = fixture();
    await f.manager.addDeviceToPassthroughList(f.device);
    assert.equal(f.attached.size, 1);
    const add = f.commands.find(c => c.command === "device_add")!;
    assert.match(add.args.id, /^[a-zA-Z][a-zA-Z0-9._-]*$/);
    assert.equal(add.args.hostdevice, "/dev/bus/usb/001/006");
});

test("removal uses the attachment ID and allows reattachment", async () => {
    const f = fixture();
    await f.manager.addDeviceToPassthroughList(f.device);
    await f.manager.removeDeviceFromPassthroughList(f.config.passedThroughDevices[0]);
    assert.equal(f.attached.size, 0);
    assert.equal(f.commands.filter(c => c.command === "device_del").length, 1);
    f.device.deviceAddress = 9;
    await f.manager.addDeviceToPassthroughList(f.device);
    assert.equal(f.attached.size, 1);
    assert.equal(f.commands.filter(c => c.command === "device_add").at(-1)!.args.hostdevice, "/dev/bus/usb/001/009");
});

test("QEMU errors cannot produce an attachment success log", async () => {
    const f = fixture();
    f.fail("USB device is busy");
    await f.manager.addDeviceToPassthroughList(f.device);
    assert.equal(f.attached.size, 0);
    assert.ok(f.logs.some(l => l[0] === "error" && JSON.stringify(l).includes("USB device is busy")));
    assert.ok(!f.logs.some(l => l.includes("QMPAddDevice")));
});

test("online reattachment skips existing devices and rediscovers the address after restart", async () => {
    const f = fixture();
    await f.manager.addDeviceToPassthroughList(f.device);
    await f.watchers[0](true);
    assert.equal(f.commands.filter(c => c.command === "device_add").length, 1);
    f.attached.clear();
    f.device.deviceAddress = 10;
    await f.watchers[0](true);
    assert.equal(f.attached.size, 1);
    assert.equal(f.commands.filter(c => c.command === "device_add").at(-1)!.args.hostdevice, "/dev/bus/usb/001/010");
});

test("USB detach and reconnect use the same QEMU ID and the new device address", async () => {
    const f = fixture();
    await f.manager.addDeviceToPassthroughList(f.device);
    const id = [...f.attached][0];
    await f.usb.listeners("detach")[0](f.device);
    assert.equal(f.attached.size, 0);
    f.device.deviceAddress = 11;
    await f.usb.listeners("attach")[0](f.device);
    assert.ok(f.attached.has(id));
    assert.equal(f.commands.filter(c => c.command === "device_add").at(-1)!.args.hostdevice, "/dev/bus/usb/001/011");
});

test("a failed removal is logged as an error rather than a successful detach", async () => {
    const f = fixture();
    await f.manager.addDeviceToPassthroughList(f.device);
    f.fail("Device removal failed");
    await f.manager.removeDeviceFromPassthroughList(f.config.passedThroughDevices[0]);
    assert.equal(f.attached.size, 1);
    assert.ok(!f.logs.some(l => l.includes("QMPRemoveDevice")));
    assert.ok(f.logs.some(l => l[0] === "error" && JSON.stringify(l).includes("Device removal failed")));
});

test("devices sharing VID:PID retain the existing single-selection policy", async () => {
    const f = fixture();
    await f.manager.addDeviceToPassthroughList(f.device);
    const duplicate = { ...f.device, deviceAddress: 12 };
    await assert.rejects(f.manager.addDeviceToPassthroughList(duplicate), /already in the passthrough list/);
    assert.equal(f.commands.filter(c => c.command === "device_add").length, 1);
});

test("legacy IDs already attached by older WinBoat versions are recognized and removable", async () => {
    const f = fixture();
    f.attached.add("43981:4660");
    await f.manager.addDeviceToPassthroughList(f.device);
    assert.equal(f.commands.filter(c => c.command === "device_add").length, 0);
    await f.manager.removeDeviceFromPassthroughList(f.config.passedThroughDevices[0]);
    assert.equal(f.attached.size, 0);
    assert.equal(f.commands.find(c => c.command === "device_del")!.args.id, "43981:4660");
});
