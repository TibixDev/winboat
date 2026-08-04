import { describe, expect, test } from "bun:test";
import { buildFreeRDPConnectionArgs, FreeRDPInstallation } from "../src/renderer/utils/getFreeRDP";

describe("FreeRDP credential handling", () => {
    test("requests stdin authentication without placing a password in argv", () => {
        const args = buildFreeRDPConnectionArgs("winboat-user", 3389);

        expect(args).toEqual(["/u:winboat-user", "/from-stdin:force", "/v:127.0.0.1", "/port:3389"]);
        expect(args.some(arg => arg.startsWith("/p:"))).toBe(false);
    });

    test("delivers secrets through stdin rather than child argv", async () => {
        const installation = new FreeRDPInstallation(process.execPath);
        const script = [
            "let input = '';",
            "process.stdin.setEncoding('utf8');",
            "process.stdin.on('data', chunk => input += chunk);",
            "process.stdin.on('end', () => console.log(JSON.stringify({ argv: process.argv.slice(1), input })));",
        ].join("");

        const { stdout } = await installation.execWithStdin(["-e", script, "visible-argument"], "private-password\n");
        const result = JSON.parse(stdout) as { argv: string[]; input: string };

        expect(result.argv).toContain("visible-argument");
        expect(result.argv).not.toContain("private-password");
        expect(result.input).toBe("private-password\n");
    });

    test("the production launcher uses stdin instead of a password argument", async () => {
        const source = await Bun.file(new URL("../src/renderer/lib/winboat.ts", import.meta.url)).text();

        expect(source).toContain("buildFreeRDPConnectionArgs(username, HOST_RDP_PORT)");
        expect(source).toContain("execWithStdin(args, `${password}\\n`)");
        expect(source).not.toContain("`/p:${password}`");
    });
});
