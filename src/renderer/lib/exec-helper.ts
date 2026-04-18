const process: typeof import("process") = require("node:process");
const child_process: typeof import("child_process") = require("node:child_process");
const { promisify }: typeof import("util") = require("node:util");

export type ExecFileAsyncError = {
    cmd: string;
    code: number;
    killed: boolean;
    signal?: string | number;
    stderr: string;
    stdout: string;
    message: string;
    stack: string;
};

const doExecFile = promisify(child_process.execFile);

function keepEnv(varName) {
    return `--env=${varName}=${process.env[varName]}`;
}

export function execFileAsync(file, args, options) {
    if (process.env.FLATPAK_ID) {
        return doExecFile("flatpak-spawn", [
            keepEnv("DISPLAY"),
            keepEnv("WAYLAND_DISPLAY"),
            "--host", file
        ].concat(args || []), options);
    } else {
        return doExecFile(file, args, options);
    }
}

export function execFileSync(file, args, options) {
    if (process.env.FLATPAK_ID) {
        return child_process.execFileSync("flatpak-spawn", ["--host", file].concat(args || []), options);
    } else {
        return child_process.execFileSync(file, args, options);
    }
}

export function stringifyExecFile(file: string, args: string[]): string {
    let result = `${file}`;
    for (const arg of args) {
        result += `  ${escapeString(arg)}`;
    }
    return result;
}

function escapeString(str: string): string {
    let fixed_string = "";
    let index = 0;
    let safe = /^[a-zA-Z0-9,._+:@%/-]$/;
    while (index < str.length) {
        let char = str[index];
        if (safe.exec(char) == null) {
            fixed_string += "\\";
        }
        fixed_string += char;
        index++;
    }
    return fixed_string;
}

type EnvMap = {
    [key: string]: string;
};

export function concatEnv(a: EnvMap, b?: EnvMap) {
    if (b !== undefined) {
        for (const key of Object.keys(b)) {
            a[key] = b[key];
        }
    }
    return a;
}
