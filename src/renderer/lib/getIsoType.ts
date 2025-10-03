const fs: typeof import('fs') = require('fs');
const { spawnSync }: typeof import('child_process') = require('child_process');
const sep = require('path').sep;
const path7zzs = require('7zip-bin-full').path7zzs.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);

const VOLUME_ID_PATTERNS = [
    // Education
    
    /(J_)?CEDN?A_X86FRE_/,
    /(J_)?CEDN?A_X64FREE?_/,

    // Enterprise
    /^(J_)?CEN?A_X86FREV_/,
    /^(J_)?CENN?A_X64FREV_/,

    // Enterprise LTSB

    /(J_)?CESN?N?_X86FREV_/,
    /(J_)?CESN?N?_X64FREV_/,

    // Enterprise LTSB (Eval)

    /CESE_X86FREE_/,
    /CESE_X64FREE_/,

    // Standard

    /^(J_)?CCSN?A_X86FRE_/,
    /^(J_)?(CCSN?A|C?CCOMA)_X64FREE?_/
];

function listIso(path: string) {
    const result = spawnSync(path7zzs, ['l', '-slt', '-ba', path], { 
        encoding: 'utf8' 
    });
    return result.stdout;
}

export async function isIsoValid(path: string) {
    const fileHandle = await fs.promises.open(path, 'r');

    try {
        const bootRecordBuffer = Buffer.alloc(2048);
        await fileHandle.read(bootRecordBuffer, 0, 2048, 17 * 2048);
        
        const signature = bootRecordBuffer.subarray(1, 6).toString('ascii');
        console.log('Sig', signature);
        
        // Check if it is IS9660
        if (signature !== 'CD001') {
            return false;
        }

        const pvdBuffer = Buffer.alloc(2048);
        await fileHandle.read(pvdBuffer, 0, 2048, 16 * 2048);

        const volumeId = pvdBuffer.subarray(40, 72).toString('ascii').trim().replace(/\0/g, '');
        
        const bootCatalogSector = bootRecordBuffer.readUInt32LE(71);
        const headerBuffer = Buffer.alloc(64);

        await fileHandle.read(headerBuffer, 0, 64, bootCatalogSector * 2048);

        const bootIndicator = headerBuffer.readUInt8(32);

        if (bootIndicator !== 0x88) {
            return false;
        }

        for (const pattern of VOLUME_ID_PATTERNS) {
            if (pattern.test(volumeId)) {
                return true;
            }
        }

        const isoFiles = listIso(path);
        
        for (const line of isoFiles.split('\n')) {
            if (line.startsWith('Path = ')) {
                const cleaned = line.substring(7);
                if(cleaned == 'sources/boot.wim') {
                    return true;
                }
            }
        }

        return false;
    }
  
    finally {
        fileHandle.close();
    }
}