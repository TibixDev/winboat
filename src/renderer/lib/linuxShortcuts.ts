import { type WinApp } from "../../types";
import { WINBOAT_DIR } from "./constants";
import { WinboatConfig } from "./config";

const fs: typeof import("fs") = require("node:fs");
const path: typeof import("path") = require("node:path");
const os: typeof import("os") = require("node:os");
const { app }: typeof import("@electron/remote") = require("@electron/remote");

const APPLICATIONS_DIR = path.join(os.homedir(), ".local", "share", "applications");
const DESKTOP_DIR = path.join(os.homedir(), "Desktop");
const SHORTCUT_ROOT = path.join(WINBOAT_DIR, "shortcuts");
const ICON_DIR = path.join(SHORTCUT_ROOT, "icons");
const SHORTCUT_PREFIX = "winboat-";
export const SHORTCUT_CHANGE_EVENT = "winboat-shortcuts-changed";

const emitShortcutChange = () => {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(SHORTCUT_CHANGE_EVENT));
    }
};

const buildAppKey = (app: WinApp) => {
    const source = (app.Source || "unknown").toLowerCase();
    const pathKey = (app.Path || "").toLowerCase();
    const argsKey = (app.Args || "").toLowerCase();
    return `${source}::${pathKey}::${argsKey}`;
};

const ensureDir = (targetPath: string) => {
    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
    }
};

const sanitizeName = (name: string) => {
    const slug = name
        .toLowerCase()
        // Replace Turkish dotted İ/ı etc before stripping accents
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    return slug || name.replace(/\s+/g, "_");
};

const escapeDesktopValue = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const buildDesktopFile = (app: WinApp, execCommand: string, iconPath: string) => {
    const desktopEntry = [
        "[Desktop Entry]",
        "Version=1.0",
        "Type=Application",
        `Name=${app.Name}`,
        `Comment=Launch ${app.Name} with WinBoat`,
        `Exec=${execCommand}`,
        `Icon=${iconPath}`,
        "Terminal=false",
        "StartupNotify=false",
        "Categories=Utility;",
    ];

    return `${desktopEntry.join("\n")}\n`;
};

export class LinuxShortcutManager {
    private readonly config: WinboatConfig;
    constructor() {
        this.config = WinboatConfig.getInstance();
        ensureDir(SHORTCUT_ROOT);
        ensureDir(ICON_DIR);
    }

    get preferences() {
        return this.config.config.linuxShortcuts;
    }

    get selectedApps() {
        return this.preferences.selectedApps ?? [];
    }

    shouldSync() {
        return this.preferences.enabled;
    }

    isAppSelected(app: WinApp) {
        return this.selectedApps.includes(buildAppKey(app));
    }

    updateSelection(app: WinApp, selected: boolean) {
        const key = buildAppKey(app);
        const currentSet = new Set(this.selectedApps);
        const initialSize = currentSet.size;

        if (selected) {
            currentSet.add(key);
        } else {
            currentSet.delete(key);
        }

        if (currentSet.size !== initialSize) {
            this.preferences.selectedApps = Array.from(currentSet);
            emitShortcutChange();
        }
    }

    removeSelection(app: WinApp) {
        this.updateSelection(app, false);
    }

    cleanupSelections(apps: WinApp[]) {
        const validKeys = new Set(apps.map(app => buildAppKey(app)));
        const filtered = this.selectedApps.filter(key => validKeys.has(key));
        if (filtered.length !== this.selectedApps.length) {
            this.preferences.selectedApps = filtered;
            emitShortcutChange();
        }
    }

    async sync(apps: WinApp[]) {
        this.cleanupSelections(apps);

        if (!this.shouldSync() || this.selectedApps.length === 0) {
            this.removeAll();
            return;
        }

        ensureDir(APPLICATIONS_DIR);
        const created = new Set<string>();
        const selectedSet = new Set(this.selectedApps);
        const selectedApps = apps.filter(app => selectedSet.has(buildAppKey(app)));

        selectedApps.forEach(app => {
            if (!app.Icon) return;
            const slug = sanitizeName(app.Name);
            const iconPath = this.persistIcon(slug, app.Icon);
            const execCommand = this.buildExecLine(app.Name);
            const desktopContent = buildDesktopFile(app, execCommand, iconPath);
            const desktopFileName = `${SHORTCUT_PREFIX}${slug}.desktop`;
            const applicationsPath = path.join(APPLICATIONS_DIR, desktopFileName);

            fs.writeFileSync(applicationsPath, desktopContent, { mode: 0o755 });
            created.add(applicationsPath);

            if (this.preferences.includeDesktop) {
                ensureDir(DESKTOP_DIR);
                const desktopShortcutPath = path.join(DESKTOP_DIR, desktopFileName);
                fs.writeFileSync(desktopShortcutPath, desktopContent, { mode: 0o755 });
                created.add(desktopShortcutPath);
            } else {
                this.removeDesktopShortcut(desktopFileName);
            }
        });

        this.pruneOrphanedShortcuts(created);
        this.pruneUnusedIcons(selectedApps);
    }

    removeAll() {
        this.pruneOrphanedShortcuts(new Set());
        this.pruneUnusedIcons([]);
    }

    private removeDesktopShortcut(filename: string) {
        const desktopShortcutPath = path.join(DESKTOP_DIR, filename);
        if (fs.existsSync(desktopShortcutPath)) {
            fs.rmSync(desktopShortcutPath);
        }
    }

    private persistIcon(slug: string, iconBase64: string) {
        const iconPath = path.join(ICON_DIR, `${slug}.png`);
        try {
            const buffer = Buffer.from(iconBase64, "base64");
            fs.writeFileSync(iconPath, buffer);
        } catch (error) {
            console.error(`Failed to persist icon for ${slug}`, error);
        }
        return iconPath;
    }

    private buildExecLine(appName: string) {
        const execPath = app.getPath("exe");
        const quotedExecPath = execPath.includes(" ") ? `"${execPath}"` : execPath;
        const escapedName = escapeDesktopValue(appName);

        let command = quotedExecPath;

        if (process.env.NODE_ENV === "development") {
            const appPath = app.getAppPath();
            const candidates = [
                path.join(appPath, "main", "main.js"),
                path.join(appPath, "..", "build", "main", "main.js"),
                path.join(appPath, "..", "..", "build", "main", "main.js"),
            ];
            const mainEntry = candidates.find(candidate => fs.existsSync(candidate));
            const rendererPort = typeof window !== "undefined" ? window.location.port : "";
            if (mainEntry) {
                const quotedMain = mainEntry.includes(" ") ? `"${mainEntry}"` : mainEntry;
                const portSegment = rendererPort ? ` ${rendererPort}` : "";
                command = `${quotedExecPath} ${quotedMain}${portSegment}`;
            }
        }

        return `${command} -- --launch "${escapedName}"`;
    }

    private pruneOrphanedShortcuts(validPaths: Set<string>) {
        const candidateDirs = [APPLICATIONS_DIR];
        if (this.preferences.includeDesktop) {
            candidateDirs.push(DESKTOP_DIR);
        }

        candidateDirs.forEach(dir => {
            if (!fs.existsSync(dir)) return;
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                if (!file.startsWith(SHORTCUT_PREFIX) || !file.endsWith(".desktop")) return;
                const fullPath = path.join(dir, file);
                if (!validPaths.has(fullPath)) {
                    fs.rmSync(fullPath);
                }
            });
        });
    }

    private pruneUnusedIcons(apps: WinApp[]) {
        if (!fs.existsSync(ICON_DIR)) return;
        const existing = new Set(fs.readdirSync(ICON_DIR));
        const expected = new Set(apps.map(app => `${sanitizeName(app.Name)}.png`));
        existing.forEach(file => {
            if (!expected.has(file)) {
                fs.rmSync(path.join(ICON_DIR, file));
            }
        });
    }
}
