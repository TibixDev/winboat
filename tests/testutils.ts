import { delimiter, join } from "node:path";
import { existsSync } from "node:fs";

export function generateRandomLowercase(length: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export function isCommandInPath(command: string): boolean {
    const pathEnv = process.env.PATH || '';
    const pathParts = pathEnv.split(delimiter);
    const extensions = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE').split(';') : [''];

    for (const part of pathParts) {
        for (const ext of extensions) {
            const fullPath = join(part, command + ext);
            if (existsSync(fullPath)) {
                return true;
            }
        }
    }
    return false;
}