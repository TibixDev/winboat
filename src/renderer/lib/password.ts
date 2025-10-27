import wordsListPath from "word-list";

const fs: typeof import("fs") = require("node:fs");
const crypto: typeof import("crypto") = require("node:crypto");

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
    const wordArray = fs.readFileSync(wordsListPath, "utf8").split("\n");
    return wordArray.filter(word => word.length >= 5);
}
