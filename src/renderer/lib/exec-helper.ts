const { execFile }: typeof import("child_process") = require("node:child_process");
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

export const execFileAsync = promisify(execFile);

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
