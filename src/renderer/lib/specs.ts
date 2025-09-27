import { getFreeRDP } from '../utils/getFreeRDP';
const fs: typeof import('fs') = require('fs');
const os: typeof import('os') = require('os');
const { exec }: typeof import('child_process') = require('child_process');
const { promisify }: typeof import('util') = require('util');
const execAsync = promisify(exec);

export function satisfiesPrequisites(specs: Specs) {
    return specs.dockerInstalled &&
        specs.dockerComposeInstalled && 
        specs.dockerIsRunning &&
        specs.dockerIsInUserGroups &&
        specs.freeRDP3Installed &&
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
    dockerComposeInstalled: false,
    dockerIsRunning: false,
    dockerIsInUserGroups: false,
    freeRDP3Installed: false,
    ipTablesLoaded: false,
    iptableNatLoaded: false
}

export async function getSpecs() {
    const specs: Specs = { ...defaultSpecs };

    specs.cpuThreads = os.cpus().length;

    // TODO: These commands might silently fail
    // But if they do, it means something wasn't right to begin with
    try {
        const memoryInfo = await getMemoryInfo();
        specs.ramGB = memoryInfo.totalGB;
    } catch (e) {
        console.error('Error reading /proc/meminfo:', e);
    }

    // Docker check
    try {
        // We use /var here because /var/lib/docker is _the_ location for Docker data.
        // Also it covers cases of immutable distros using Podman (hello Bazzite!), since
        // /home is a symlink to /var/home there.
        // TODO:hdkv where does Podman stores the images and the data on non-immutables (aka regular Fedora)?
        const diskStats = fs.statfsSync('/var');
        specs.diskSpaceGB = Math.round(diskStats.bavail * diskStats.bsize / 1024 / 1024 / 1024 * 100) / 100;
    } catch (e) {
        console.error('Error getting disk space for /var:', e);
    }

    // KVM check
    try {
        const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
        if ((cpuInfo.includes('vmx') || cpuInfo.includes('svm')) && fs.existsSync('/dev/kvm')) {
            specs.kvmEnabled = true;
        }
    } catch (e) {
        console.error('Error reading /proc/cpuinfo or checking /dev/kvm:', e);
    }

    // Docker check
    try {
        const { stdout: dockerOutput } = await execAsync('docker --version');
        specs.dockerInstalled = !!dockerOutput;
    } catch (e) {
        console.error('Error checking for Docker installation:', e);
    }

    // Docker Compose plugin check with version validation
    try {
        const { stdout: dockerComposeOutput } = await execAsync('docker compose version');
        if (dockerComposeOutput) {
            // Example output: "Docker Compose version v2.35.1"
            // Example output 2: "Docker Compose version 2.36.2"
            const versionMatch = dockerComposeOutput.match(/(\d+\.\d+\.\d+)/);
            if (versionMatch) {
                const majorVersion = parseInt(versionMatch[1].split('.')[0], 10);
                specs.dockerComposeInstalled = majorVersion >= 2;
            } else {
                specs.dockerComposeInstalled = false; // No valid version found
            }
        } else {
            specs.dockerComposeInstalled = false; // No output, plugin not installed
        }
    } catch (e) {
        console.error('Error checking Docker Compose version:', e);
    }

    // Docker is running check
    try {
        const { stdout: dockerOutput } = await execAsync('docker ps');
        specs.dockerIsRunning = !!dockerOutput;
    } catch (e) {
        console.error('Error checking if Docker is running:', e);
    }

    // Docker user group check
    try {
        const userGroups = (await execAsync('id -Gn')).stdout;
        specs.dockerIsInUserGroups = userGroups.split(/\s+/).includes('docker');
    } catch (e) {
        console.error('Error checking user groups for docker:', e);
    }

    // FreeRDP 3.x.x check (including Flatpak)
    try {
        const freeRDPBin = await getFreeRDP();
        specs.freeRDP3Installed = !!freeRDPBin;
    } catch(e) {
        console.error('Error checking FreeRDP 3.x.x installation (most likely not installed):', e);
    }

    // iptables kernel module check
    try {
        const { stdout: ipTablesOutput } = await execAsync('lsmod | grep ip_tables');
        specs.ipTablesLoaded = !!ipTablesOutput.trim();
    } catch (e) {
        console.error('Error checking ip_tables module:', e);
    }

    // iptables_nat kernel module check
    try {
        const { stdout: iptableNatOutput } = await execAsync('lsmod | grep iptable_nat');
        specs.iptableNatLoaded = !!iptableNatOutput.trim();
    } catch (e) {
        console.error('Error checking iptable_nat module:', e);
    }

    if (!specs.ipTablesLoaded) {
        try {
            const { stdout: nftablesOutput } = await execAsync('lsmod | grep nf_tables');
            if (nftablesOutput.trim().length > 0) {
                specs.ipTablesLoaded = true;
                specs.iptableNatLoaded = true;
            }
        } catch (e) {
            console.error('Error checking nf_tables module:', e);
        }
    }

    console.log('Specs:', specs);
    return specs;
}


export type MemoryInfo = {
    totalGB: number;
    availableGB: number;
}

export async function getMemoryInfo() {
    try {
        const memoryInfo: MemoryInfo = {
            totalGB: 0,
            availableGB: 0,
        }
        const memInfo = fs.readFileSync('/proc/meminfo', 'utf8');
        const totalMemLine = memInfo.split('\n').find(line => line.startsWith('MemTotal'));
        const availableMemLine = memInfo.split('\n').find(line => line.startsWith('MemAvailable'));
        if (totalMemLine) {
            memoryInfo.totalGB = Math.round(parseInt(totalMemLine.split(/\s+/)[1]) / 1024 / 1024 * 100) / 100;
        }

        if (availableMemLine) {
            memoryInfo.availableGB = Math.round(parseInt(availableMemLine.split(/\s+/)[1]) / 1024 / 1024 * 100) / 100;
        }

        return memoryInfo;
    } catch (e) {
        console.error('Error reading /proc/meminfo:', e);
        throw e;
    }
}
