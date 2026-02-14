# DOSBoat Local FreeDOS Image Implementation

## Summary

Implemented a local FreeDOS container image build system to replace the unavailable `ghcr.io/dockur/freedos:latest` registry image. The solution uses an efficient base image + overlay approach that minimizes disk usage while preserving user install location choices.

## Changes Made

### 1. Created Container Image Build Infrastructure

**File: [build/freedos-image/Dockerfile](build/freedos-image/Dockerfile)**
- Based on `debian:bookworm-slim`
- Installs QEMU system (`qemu-system-x86`, `qemu-utils`)
- Installs noVNC and websockify for web-based VNC access
- Exposes ports 8006 (noVNC) and 7149 (QMP)
- Uses custom entrypoint script

**File: [build/freedos-image/entrypoint.sh](build/freedos-image/entrypoint.sh)**
- Creates QCOW2 overlay disk using base image as backing file
- Handles disk resizing when user requests > 1GB
- Supports custom ISO boot via `CUSTOM_ISO` environment variable
- Configures QEMU with proper CPU, RAM, and KVM settings
- Starts noVNC websockify for browser-based access
- Boots from overlay disk using `-boot order=c` (not `bootindex` which isn't supported with IDE+qcow2)
- Boots from custom ISO if provided using `-boot order=d`

**File: [build/freedos-image/README.md](build/freedos-image/README.md)**
- Complete instructions for creating the 1GB base image
- Documents the base + overlay architecture
- Troubleshooting guide
- Customization options

### 2. Updated Compose Templates

**File: [src/renderer/data/docker.ts](src/renderer/data/docker.ts)**
- Changed from `image: "ghcr.io/dockur/freedos:latest"` to local build
- Added `build` configuration with relative path `./build/freedos-image` (converted to absolute at runtime)
- Replaced `./oem:/oem` volume with `./images/FD14-base.qcow2:/oem/base.qcow2:ro` (converted to absolute at runtime)
- Base image is mounted read-only for safety

**File: [src/renderer/data/podman.ts](src/renderer/data/podman.ts)**
- Same changes as Docker template
- Maintains Podman-specific settings (NETWORK: "user", random host ports)

### 3. Updated Installation Logic

**File: [src/renderer/lib/install.ts](src/renderer/lib/install.ts)**
- Detects app root path dynamically (handles both dev and production modes)
- Converts build context from relative to absolute path before writing compose file
- Converts base image path from relative to absolute path before writing compose file
- Added `CUSTOM_ISO` environment variable when user provides custom ISO path
- Maintains existing volume mount of custom ISO to `/boot.iso`
- Entrypoint script reads `CUSTOM_ISO` var to determine boot method

**File: [src/types.ts](src/types.ts)**
- Made `image` property optional in ComposeConfig
- Added optional `build` property with `context` and `dockerfile` fields
- Added `CUSTOM_ISO` to environment variables type

### 4. Existing Configuration (Verified)

**File: [src/renderer/views/SetupUI.vue](src/renderer/views/SetupUI.vue)**
- Already defaults install location to `~/dosboat/` (line 881)
- User choice is honored and passed to install.ts
- No changes needed

## Architecture

### Disk Image Strategy

```
images/FD14-base.qcow2 (1GB, read-only)
           ↓ (backing file)
~/dosboat/disk.qcow2 (overlay, user's install folder)
```

**Benefits:**
- Base image shared across all features/resets
- Overlay contains only delta changes
- Efficient storage (overlay starts nearly empty)
- User can resize disk by resizing overlay only
- Base image protected from corruption (read-only mount)

### Boot Flow

1. User selects install location (default: `~/dosboat/`)
2. Compose file maps install folder to `/storage` volume
3. Base image mounted read-only at `/oem/base.qcow2`
4. Container entrypoint checks for `/storage/disk.qcow2`
5. If missing, creates overlay: `qemu-img create -f qcow2 -b /oem/base.qcow2 -F qcow2 /storage/disk.qcow2`
6. If disk size > 1GB, resizes overlay: `qemu-img resize /storage/disk.qcow2 <size>`
7. QEMU boots from overlay disk
8. All changes written to overlay, base remains pristine

### Custom ISO Support

When user provides custom ISO:
1. ISO mounted to container at `/boot.iso`
2. `CUSTOM_ISO=/boot.iso` environment variable set
3. Entrypoint boots QEMU with `-cdrom /boot.iso -boot order=d`
4. Overlay disk still attached, receives installation

## Prerequisites for Users

Before first run, users must create the base image:

```bash
# 1. Create blank disk
qemu-img create -f qcow2 /tmp/freedos-install.qcow2 1G

# 2. Boot from LiveCD and install
qemu-system-i386 \
  -m 512M \
  -hda /tmp/freedos-install.qcow2 \
  -cdrom images/FD14-LiveCD/FD14LIVE.iso \
  -boot d \
  -enable-kvm

# 3. Commit as base image
cp /tmp/freedos-install.qcow2 images/FD14-base.qcow2
```

Full instructions in [build/freedos-image/README.md](build/freedos-image/README.md).

## Testing Checklist

See [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) for comprehensive testing guide.

## Issues Encountered and Resolved

### 1. Relative Path Resolution
**Problem**: Docker Compose was unable to find build context and base image because relative paths (`./build/freedos-image`, `./images/FD14-base.qcow2`) were resolved from the compose file location (`~/.dosboat/`) instead of the project directory.

**Solution**: Modified `install.ts` to detect the app root path and convert all relative paths to absolute paths before writing the compose file.

### 2. QEMU Boot Configuration
**Problem**: QEMU crashed with error: `Block format 'qcow2' does not support the option 'bootindex'` when trying to boot the overlay disk.

**Solution**: Changed from `-drive file=disk.qcow2,format=qcow2,if=ide,bootindex=0` to `-drive file=disk.qcow2,format=qcow2,if=ide -boot order=c`. The `bootindex` option is not supported with IDE drives in qcow2 format.

### 3. Docker Compose stderr Logging
**Note**: Docker Compose writes progress output to stderr (not stdout), which appears as "error" level in the console logger. This is normal behavior - actual errors will include failure messages and prevent the container from starting.

## Migration Notes

- Existing installations using `ghcr.io/dockur/freedos:latest` will need migration
- Old disk images in `data:/storage` volume need to be extracted
- Consider adding migration step in UI to detect old installations
- May need to add fallback to old image if base doesn't exist

## Future Enhancements

- [ ] Automate base image creation (script or CI/CD)
- [ ] Include pre-built base image in releases
- [ ] Add base image version checking
- [ ] Support multiple FreeDOS versions (FD12, FD13, FD14)
- [ ] Add base image integrity verification (checksums)
- [ ] Create "factory reset" feature (delete overlay, recreate from base)
