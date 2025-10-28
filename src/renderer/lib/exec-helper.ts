const { execFile }: typeof import("child_process") = require("node:child_process");
const { promisify }: typeof import("util") = require("node:util");

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
    let safe = RegExp("^[a-zA-Z0-9,._+:@%/-]$");
    while (index < str.length) {
        let char = str[index];
        if (char.match(safe) == null) {
            fixed_string += "\\";
        }
        fixed_string += char;
        index++;
    }
    return fixed_string;
}
