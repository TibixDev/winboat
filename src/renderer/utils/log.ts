import { createConsola } from "consola";
const { writeFileSync, appendFileSync, mkdirSync }: typeof import("fs") = require("node:fs");
const { dirname }: typeof import("path") = require("node:path");

export function createLogger(filePath: string) {
    const logger = createConsola({
        level: 4,
        formatOptions: {
            colors: true,
            date: true,
            compact: false,
        },
    });

    // Add file logging with directory creation
    logger.addReporter({
        log: logObj => {
            const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
            const level = logObj.type.toUpperCase();
            const message = logObj.args.join(" ");
            const logLine = `${timestamp} | ${level} | ${message}\n`;

            try {
                appendFileSync(filePath, logLine);
            } catch {
                // Create the directory path if it doesn't exist
                const dir = dirname(filePath);
                mkdirSync(dir, { recursive: true });

                // Now create the file
                writeFileSync(filePath, logLine);
            }
        },
    });

    return logger;
}
