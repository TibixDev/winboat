type Specs = import("../types").Specs;

interface Window {
    electronAPI: {
        executeShellCommand: (command: string) => Promise<string>;
        openLink: (link: string) => Promise<void>;
        minimizeWindow: () => void;
        maximizeWindow: () => void;
        closeWindow: () => void;
        specs: () => Promise<Specs>;
    };
}
