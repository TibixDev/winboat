import Path from "path";
import Chalk from "chalk";
import FileSystem from "fs";
import Util from "util";
import * as Vite from "vite";
import compileTs from "./private/tsc.ts";
// ^ Extension can't be omitted because Node expects it
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = Path.dirname(__filename);

function buildRenderer() {
    return Vite.build({
        configFile: Path.join(__dirname, "..", "vite.config.ts"),
        base: "./",
        mode: "production",
    });
}

function buildMain() {
    const mainPath = Path.join(__dirname, "..", "src", "main");
    return compileTs(mainPath);
}

function formatFailure(reason: unknown) {
    if (reason instanceof Error) {
        return reason.stack ?? reason.message;
    }

    if (typeof reason === "number") {
        return `Process exited with code ${reason}`;
    }

    return Util.inspect(reason, { depth: 4, colors: false });
}

FileSystem.rmSync(Path.join(__dirname, "..", "build"), {
    recursive: true,
    force: true,
});

console.log(Chalk.blueBright("Transpiling renderer & main..."));

const buildSteps = [
    { name: "renderer", run: buildRenderer },
    { name: "main", run: buildMain },
] as const;

const results = await Promise.allSettled(buildSteps.map(step => step.run()));
const failures = results
    .map((result, index) => ({ result, step: buildSteps[index] }))
    .filter((entry): entry is { result: PromiseRejectedResult; step: (typeof buildSteps)[number] } => {
        return entry.result.status === "rejected";
    });

if (failures.length > 0) {
    console.error(Chalk.redBright("Failed to transpile renderer & main."));

    for (const failure of failures) {
        console.error(Chalk.redBright(`\n${failure.step.name} build failed:`));
        console.error(Chalk.white(formatFailure(failure.result.reason)));
    }

    process.exitCode = 1;
} else {
    console.log(
        Chalk.greenBright("Renderer & main successfully transpiled! (ready to be built with electron-builder)"),
    );
}
