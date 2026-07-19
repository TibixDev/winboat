/**
 * Product-path helper: ensure guest-port-forward is installed into a running
 * Podman WinBoat container. Safe for live VMs (no container restart).
 *
 * Usage:
 *   bun scripts/ensure-rootless-forwards.ts [containerName] [--replace]
 */
import {
    ensureRootlessGuestPortForwards,
    isPodmanRootless,
    hostForwarderBinaryPath,
} from "../src/renderer/lib/containers/rootless-port-forward";

const args = process.argv.slice(2);
const replaceExisting = args.includes("--replace");
const containerName = args.find(a => !a.startsWith("--")) || "WinBoat";

async function main() {
    const rootless = await isPodmanRootless();
    const binary = hostForwarderBinaryPath();
    console.log(JSON.stringify({ containerName, rootless, binary, replaceExisting }));
    if (!rootless) {
        console.log("not rootless podman; skipping (Docker/rootful DNAT path)");
        return;
    }
    const result = await ensureRootlessGuestPortForwards({
        containerName,
        replaceExisting,
    });
    console.log(JSON.stringify(result));
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
