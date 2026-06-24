/**
 * vfio.ts — privileged-side wrapper for the winboat-gpu-helper binary.
 *
 * The renderer never touches /sys directly when WRITING. All write paths
 * (driver_override, drivers_probe, etc.) go through this module, which in
 * turn invokes a tiny statically-linked Go helper via `pkexec`. The helper
 * does its own input validation and refuses anything other than a
 * well-formed PCI BDF — so even a compromised renderer cannot trick the
 * helper into writing to arbitrary sysfs files.
 *
 * Why pkexec and not `sudo`?
 *
 *   * `sudo` requires a tty by default (NOPASSWD entries excepted) which
 *     doesn't fit an Electron app. pkexec hands control to the desktop
 *     environment's polkit agent (gnome-authentication-agent /
 *     polkit-kde-authentication-agent / ...) and gets us a GUI password
 *     prompt for free.
 *   * The polkit policy file ships with WinBoat and is action-scoped:
 *     authorising `org.winboat.gpu-passthrough.manage` grants only the
 *     ability to invoke our helper binary, not arbitrary commands.
 *   * `auth_admin_keep` in the policy means a single auth covers the
 *     bind-on-start + unbind-on-stop pair within a session.
 *
 * Helper resolution order:
 *
 *   1. process.env.WINBOAT_GPU_HELPER     (test / dev override)
 *   2. <process.resourcesPath>/winboat-gpu-helper  (production AppImage / deb / rpm)
 *   3. ../../../gpu_helper/winboat-gpu-helper relative to this file
 *      (dev: when running `npm run electron:serve`).
 *
 * NOTE on capability flags (carry-forward from the audit, Appendix B.6):
 *   The docker-compose service that runs QEMU must have
 *     cap_add:
 *       - SYS_ADMIN
 *     devices:
 *       - /dev/vfio/<group>:/dev/vfio/<group>
 *       - /dev/vfio/vfio:/dev/vfio/vfio
 *   We deliberately do NOT add SYS_RAWIO: vfio-pci uses regular sysfs +
 *   the /dev/vfio character device, not /dev/mem. Adding SYS_RAWIO would
 *   weaken the container without enabling anything we need.
 *
 * Sources of truth (primary):
 *   - polkit policy syntax:
 *     https://www.freedesktop.org/software/polkit/docs/latest/polkit.8.html
 *   - pkexec(1) escalation model:
 *     https://www.freedesktop.org/software/polkit/docs/latest/pkexec.1.html
 *   - VFIO group device file location:
 *     https://docs.kernel.org/driver-api/vfio.html#groups-devices-and-iommu
 *   - capabilities(7) (SYS_ADMIN vs SYS_RAWIO):
 *     https://man7.org/linux/man-pages/man7/capabilities.7.html
 */

const childProcess: typeof import("node:child_process") = require("node:child_process");
const fs: typeof import("node:fs") = require("node:fs");
const path: typeof import("node:path") = require("node:path");

const PKEXEC_PATHS = ["/usr/bin/pkexec", "/bin/pkexec"];

/**
 * Result envelope for any helper invocation. Mirrors the JSON the Go
 * helper emits. `ok=false` always indicates a real failure (parse error
 * counts as a failure here — see runHelper).
 */
export interface HelperResult {
    ok: boolean;
    action: string;
    bdf?: string;
    affected?: string[];
    drivers?: Record<string, string>;
    error?: string;
    helper_version?: string;
}

/**
 * Errors specific to this module. Catchers can distinguish "user
 * cancelled the polkit prompt" from "helper crashed" by inspecting
 * `code`.
 */
export class VfioHelperError extends Error {
    constructor(
        public readonly code:
            | "HELPER_NOT_FOUND"
            | "PKEXEC_NOT_FOUND"
            | "AUTH_CANCELLED"
            | "HELPER_ERROR"
            | "MALFORMED_OUTPUT",
        message: string,
        public readonly stderr?: string,
        public readonly exitCode?: number,
    ) {
        super(message);
        this.name = "VfioHelperError";
    }
}

/**
 * Locate the helper binary. Throws VfioHelperError("HELPER_NOT_FOUND")
 * if none of the search locations contain an executable file.
 */
export function resolveHelperPath(): string {
    const envOverride = process.env.WINBOAT_GPU_HELPER;
    const candidates: string[] = [];
    if (envOverride) candidates.push(envOverride);

    // Production: electron-builder stages extraResources under
    // process.resourcesPath. We only read it lazily because tests
    // running outside Electron won't have it.
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    if (resourcesPath) {
        candidates.push(path.join(resourcesPath, "winboat-gpu-helper"));
    }

    // Dev mode: this file is renderer-side TS, so __dirname after Vite
    // build is the renderer build dir. We fall through to a few likely
    // sibling locations.
    candidates.push(
        path.resolve(__dirname, "../../../gpu_helper/winboat-gpu-helper"),
        path.resolve(process.cwd(), "gpu_helper/winboat-gpu-helper"),
    );

    for (const c of candidates) {
        try {
            const st = fs.statSync(c);
            if (st.isFile()) return c;
        } catch {
            // ENOENT — keep looking.
        }
    }
    throw new VfioHelperError(
        "HELPER_NOT_FOUND",
        `winboat-gpu-helper binary not found. Searched: ${candidates.join(", ")}`,
    );
}

function resolvePkexec(): string {
    for (const p of PKEXEC_PATHS) {
        try {
            if (fs.statSync(p).isFile()) return p;
        } catch {
            /* keep looking */
        }
    }
    throw new VfioHelperError(
        "PKEXEC_NOT_FOUND",
        "pkexec was not found on PATH. Install policykit-1 / polkit so WinBoat can request privileges to manage the GPU.",
    );
}

interface SpawnOptions {
    /**
     * When true, invoke the helper directly (no pkexec). Used for the
     * read-only `status` subcommand, where the polkit policy allows
     * unauthenticated execution anyway. Skipping pkexec on the hot path
     * keeps the UI snappy.
     */
    unprivileged?: boolean;
    /** Soft timeout in ms; the child is SIGKILLed if it overruns. */
    timeoutMs?: number;
}

/**
 * Spawn the helper. Returns the parsed JSON envelope. Throws
 * VfioHelperError on any failure (cancelled prompt, non-zero exit,
 * unparseable stdout).
 */
/** Union of helper subcommands. Kept in sync with the Go helper's
 *  main() switch in gpu_helper/main.go. New subcommands MUST be added
 *  here AND in main.go's switch. */
export type HelperSubcommand =
    | "bind"
    | "unbind"
    | "status"
    | "modprobe"
    | "sriov-status"
    | "sriov-probe"
    | "sriov-configure";

export async function runHelper(
    subcommand: HelperSubcommand,
    args: string[],
    opts: SpawnOptions = {},
): Promise<HelperResult> {
    const helper = resolveHelperPath();
    let cmd: string;
    let cmdArgs: string[];

    if (opts.unprivileged) {
        cmd = helper;
        cmdArgs = [subcommand, ...args];
    } else {
        const pkexec = resolvePkexec();
        cmd = pkexec;
        // pkexec passes argv straight through. We pass `--disable-internal-agent`
        // is NOT used — letting the user's polkit agent handle the prompt
        // produces a much better UX than pkexec's fallback tty prompt.
        cmdArgs = [helper, subcommand, ...args];
    }

    return new Promise<HelperResult>((resolve, reject) => {
        const child = childProcess.spawn(cmd, cmdArgs, {
            stdio: ["ignore", "pipe", "pipe"],
            // Do not inherit env — pkexec ignores most of it anyway, and we
            // want a deterministic environment for the helper.
            env: {
                PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
                // Some polkit agents look at DISPLAY / WAYLAND_DISPLAY /
                // XDG_RUNTIME_DIR to put the prompt on the right screen.
                DISPLAY: process.env.DISPLAY ?? "",
                WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY ?? "",
                XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? "",
            },
        });

        let stdout = "";
        let stderr = "";
        child.stdout.on("data", chunk => (stdout += chunk));
        child.stderr.on("data", chunk => (stderr += chunk));

        const timeout =
            opts.timeoutMs && opts.timeoutMs > 0
                ? setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs)
                : null;

        child.on("error", err => {
            if (timeout) clearTimeout(timeout);
            reject(
                new VfioHelperError(
                    "HELPER_ERROR",
                    `failed to launch ${cmd}: ${err instanceof Error ? err.message : String(err)}`,
                ),
            );
        });

        child.on("close", code => {
            if (timeout) clearTimeout(timeout);

            // pkexec returns:
            //   126 — authentication failed / not authorised
            //   127 — pkexec couldn't find the helper or user cancelled
            // The helper itself returns:
            //    0  — success
            //    1  — privileged op failed
            //    2  — bad input / usage
            if (!opts.unprivileged && (code === 126 || code === 127)) {
                reject(
                    new VfioHelperError(
                        "AUTH_CANCELLED",
                        "Authentication was cancelled or denied. WinBoat cannot manage the GPU without administrator privileges.",
                        stderr,
                        code ?? undefined,
                    ),
                );
                return;
            }

            // Parse whichever stream got JSON. Success goes to stdout,
            // errors go to stderr; we try both for robustness.
            const tryParse = (s: string): HelperResult | null => {
                const trimmed = s.trim();
                if (!trimmed) return null;
                // Helper emits one line per invocation; if pkexec's polkit
                // agent prepended noise, take the last newline-delimited
                // chunk.
                const lastLine = trimmed.split("\n").pop() ?? trimmed;
                try {
                    return JSON.parse(lastLine) as HelperResult;
                } catch {
                    return null;
                }
            };

            const parsed = tryParse(stdout) ?? tryParse(stderr);

            if (parsed === null) {
                reject(
                    new VfioHelperError(
                        "MALFORMED_OUTPUT",
                        `helper produced no JSON envelope (exit ${code}). stderr=${stderr.slice(0, 200)}`,
                        stderr,
                        code ?? undefined,
                    ),
                );
                return;
            }

            if (!parsed.ok) {
                reject(
                    new VfioHelperError(
                        "HELPER_ERROR",
                        parsed.error ?? `helper reported failure (exit ${code})`,
                        stderr,
                        code ?? undefined,
                    ),
                );
                return;
            }

            resolve(parsed);
        });
    });
}

// ---------------------------------------------------------------------------
// High-level operations — these are what gpuManager.ts will call.
// ---------------------------------------------------------------------------

/**
 * Make sure the `vfio-pci` module is loaded in the running kernel. Safe
 * to call repeatedly; the helper translates this to `modprobe vfio-pci`
 * which is itself idempotent.
 */
export async function ensureVfioModuleLoaded(): Promise<HelperResult> {
    return runHelper("modprobe", []);
}

/**
 * Bind a GPU (and optionally every PCI function in its IOMMU group) to
 * vfio-pci. Returns once the kernel has finished re-probing the bus.
 *
 * @param bdf            Canonical or short BDF, e.g. "03:00.0".
 * @param includeGroup   When true, every member of the IOMMU group is
 *                       bound. Almost always what the caller wants \u2014 a
 *                       VFIO group must be passed through as a unit.
 */
export async function bindGpuToVfio(bdf: string, includeGroup = true): Promise<HelperResult> {
    const args = [`--bdf=${bdf}`];
    if (includeGroup) args.push("--include-group");
    return runHelper("bind", args);
}

/**
 * Reverse a previous bindGpuToVfio call. The original driver (if its
 * module is still loaded) reclaims the device via drivers_probe.
 */
export async function unbindGpuFromVfio(bdf: string, includeGroup = true): Promise<HelperResult> {
    const args = [`--bdf=${bdf}`];
    if (includeGroup) args.push("--include-group");
    return runHelper("unbind", args);
}

/**
 * Cheap, unprivileged status query. Used by GpuManager to decide
 * whether a pre-boot bind is even needed.
 */
export async function getGroupDriverStatus(bdf: string, includeGroup = true): Promise<HelperResult> {
    const args = [`--bdf=${bdf}`];
    if (includeGroup) args.push("--include-group");
    return runHelper("status", args, { unprivileged: true });
}

// ---------------------------------------------------------------------------
// Test exports
// ---------------------------------------------------------------------------

export const __test__ = {
    PKEXEC_PATHS,
};
