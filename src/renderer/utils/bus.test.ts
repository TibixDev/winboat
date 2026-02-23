import { MessageBus } from "./bus"

describe("Test MessageBus", () => {
    test("Create MessageBus", () => {
        let b = new MessageBus();
        expect(b).toHaveProperty("send");
        expect(b).toHaveProperty("waitFor");
    });

    test("Test MessageBus", async () => {
        let testbus = new MessageBus();
        let channel = "TEST";
        let message = new Array(128)
            .fill(0)
            .map(() => 65+Math.round(Math.random() * (90-65)))
            .map((c) => String.fromCharCode(c))
            .join('');

        expect(async () => {
            testbus.send(channel, message);
            return await testbus.waitFor(channel);
        }).resolves.toBe(message);
    })
});