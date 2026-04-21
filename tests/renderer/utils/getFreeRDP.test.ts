import { FreeRDPInstallation, getFreeRDP } from "../../../src/renderer/utils/getFreeRDP";
import { existsSync } from "node:fs";

describe("Test getFreeRDP", () => {
    let freerdp: null | FreeRDPInstallation | undefined = undefined;

    // test freeRDP class return (null or class instance)
    test("Get FreeRDP Instance", async () => {
        freerdp = await getFreeRDP();
        if(freerdp === null) {
            expect(freerdp).toBe(null);
        } else {
            expect(freerdp).toBeInstanceOf(FreeRDPInstallation);
        }
    });

    // test rdp class file existance
    const rdpClassTestName = "Test FreeRDPInstallation Class";
    if(freerdp !== null) {
        test(rdpClassTestName, () => {
            // test type of file
            expect(freerdp?.file).toEqual(expect.any("string"));

            // test existance
            expect(existsSync(freerdp?.file as string)).toBeTruthy();
        })
    } else {
        test.skip(`${rdpClassTestName} (no freerdp installation).`);
    }
});