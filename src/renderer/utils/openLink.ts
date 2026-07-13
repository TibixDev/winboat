const { shell }: typeof import("@electron/remote") = require("@electron/remote");
const path: typeof import("path") = require("node:path");
import { WINBOAT_DIR } from "../lib/constants";

export function openLink(link: string) {
    if (link.startsWith("http")) {
        shell.openExternal(link);
    } else {
        shell.showItemInFolder(link);
    }
}

export function openAnchorLink(e: MouseEvent) {
    e.preventDefault();
    const target = e.target as HTMLAnchorElement;
    const href = target.getAttribute("href");
    if (href) {
        openLink(href);
    }
}

export function openContainerLogFile() {
    const logPath = path.join(path.join(WINBOAT_DIR, "container.log"));
    shell.openPath(logPath);
}
