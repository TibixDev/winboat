const fs: typeof import("fs") = require("node:fs");
const path: typeof import("path") = require("node:path");
const crypto: typeof import("crypto") = require("node:crypto");
const remote: typeof import("@electron/remote") = require("@electron/remote");

export function generateRandomPassword(wordList: string[], length: number, separator: string): string {
    let result = "";
    separator = separator || "-";
    for (let i = 0; i < length; i++) {
        if (i > 0 && i < length) {
            result += separator;
        }
        result += getRandomWordFrom(wordList);
    }
    return result;
}

function getRandomWordFrom(words: string[]) {
    let i = crypto.randomInt(0, words.length);
    return words[i];
}

export function readWordList(): string[] {
    const pattern = new RegExp(" *\\d{5}\\t(\\w+) *(?:\\n|\\r\\n|\\r)", "g");
    // TODO: I would prefer if this is something like rust's include_str!
    const filePath = remote.app.isPackaged
        ? path.join(process.resourcesPath, "data", "eff_large_wordlist.txt") // For packaged app
        : path.join(remote.app.getAppPath(), "..", "..", "data", "eff_large_wordlist.txt"); // For dev mode
    const content = fs.readFileSync(filePath);
    let result = [];
    for (const word of content.toString().matchAll(pattern)) {
        result.push(word[1]);
    }
    return result;
}
