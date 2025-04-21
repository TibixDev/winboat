const fs: typeof import('fs') = require('fs');
const os: typeof import('os') = require('os');
const { exec }: typeof import('child_process') = require('child_process');
const { promisify }: typeof import('util') = require('util');
const execAsync = promisify(exec);

export function satisfiesPrequisites(specs: Specs) {
    return specs.dockerInstalled && 
        specs.freeRDPInstalled &&
        specs.ipTablesLoaded &&
        specs.iptableNatLoaded &&
        specs.kvmEnabled &&
        specs.ramGB >= 4 &&
        specs.cpuThreads >= 2 &&
        specs.diskSpaceGB >= 32
}

export const defaultSpecs: Specs = { 
    cpuThreads: 0,
    ramGB: 0,
    diskSpaceGB: 0,
    kvmEnabled: false,
    dockerInstalled: false,
    freeRDPInstalled: false,
    ipTablesLoaded: false,
    iptableNatLoaded: false
}

export async function getSpecs() {
    const specs: Specs = { ...defaultSpecs };

    specs.cpuThreads = os.cpus().length;

    // TODO: These commands might silently fail
    // But if they do, it means something wasn't right to begin with
    try {
        const memInfo = fs.readFileSync('/proc/meminfo', 'utf8');
        const totalMemLine = memInfo.split('\n').find(line => line.startsWith('MemTotal'));
        if (totalMemLine) {
            specs.ramGB = Math.round(parseInt(totalMemLine.split(/\s+/)[1]) / 1024 / 1024 * 100) / 100;
        }
    } catch (e) { }

    try {
        // We use /var here because /var/lib/docker is _the_ location for Docker data.
        // Also it covers cases of immutable distros using Podman (hello Bazzite!), since
        // /home is a symlink to /var/home there.
        // TODO:hdkv where does Podman stores the images and the data on non-immutables (aka regular Fedora)?
        const diskStats = fs.statfsSync('/var');
        specs.diskSpaceGB = Math.round(diskStats.bavail * diskStats.bsize / 1024 / 1024 / 1024 * 100) / 100;
    } catch (e) { }

    try {
        const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
        if ((cpuInfo.includes('vmx') || cpuInfo.includes('svm')) && fs.existsSync('/dev/kvm')) {
            specs.kvmEnabled = true;
        }
    } catch (e) { }

    try {
        const { stdout: dockerOutput } = await execAsync('docker --version');
        specs.dockerInstalled = !!dockerOutput;
    } catch (e) { }

    try {
        const freeRDPAliases = ["xfreerdp", "xfreerdp3", "flatpak run --command=xfreerdp com.freerdp.FreeRDP"];
        for(const alias of freeRDPAliases) {
            specs.freeRDPInstalled ||= !!(await execAsync(`${alias} || exit 0`)).stdout;
        }
    } catch(e) {}

    try {
        const { stdout: ipTablesOutput } = await execAsync('lsmod | grep ip_tables');
        specs.ipTablesLoaded = !!ipTablesOutput.trim();
    } catch (e) { }

    try {
        const { stdout: iptableNatOutput } = await execAsync('lsmod | grep iptable_nat');
        specs.iptableNatLoaded = !!iptableNatOutput.trim();
    } catch (e) { }

    console.log('Specs:', specs);
    return specs;
}
