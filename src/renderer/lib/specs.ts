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
        specs.ramGB >= 4 &&
        specs.cpuThreads >= 2
}

export const defaultSpecs = { 
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
    const specs = {
        cpuThreads: os.cpus().length,
        ramGB: 0,
        diskSpaceGB: 0,
        kvmEnabled: false,
        dockerInstalled: false,
        freeRDPInstalled: false,
        ipTablesLoaded: false,
        iptableNatLoaded: false,
    };

    try {
        const memInfo = fs.readFileSync('/proc/meminfo', 'utf8');
        const totalMemLine = memInfo.split('\n').find(line => line.startsWith('MemTotal'));
        if (totalMemLine) {
            specs.ramGB = Math.round(parseInt(totalMemLine.split(/\s+/)[1]) / 1024 / 1024 * 100) / 100;
        }
    } catch (e) { }

    try {
        const diskStats = fs.statfsSync('/');
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