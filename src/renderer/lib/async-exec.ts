const { execFile }: typeof import("child_process") = require("child_process");
const { promisify }: typeof import("util") = require("util");

export const execFileAsync = promisify(execFile);
