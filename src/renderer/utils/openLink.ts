const { shell }: typeof import("@electron/remote") = require("@electron/remote");
import { CONTAINER_LOG_FILE } from "../lib/constants";

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
    shell.openPath(CONTAINER_LOG_FILE);
}
