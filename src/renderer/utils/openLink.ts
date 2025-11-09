const { shell }: typeof import("@electron/remote") = require("@electron/remote");

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
