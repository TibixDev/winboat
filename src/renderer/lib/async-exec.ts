const { execFile }: typeof import("child_process") = require("node:child_process");
const { promisify }: typeof import("util") = require("node:util");

export const execFileAsync = promisify(execFile);
