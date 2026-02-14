# Testing Checklist for Local FreeDOS Image Implementation

## Pre-Testing Setup

- [ ] Install QEMU: `sudo apt-get install qemu-system-x86 qemu-utils` (or equivalent)
- [ ] Verify FreeDOS LiveCD exists: `ls images/FD14-LiveCD/FD14LIVE.iso`
- [ ] Create base image: `./scripts/create-base-image.sh`
- [ ] Verify base image: `qemu-img info images/FD14-base.qcow2`

## Container Build Testing

### Docker
- [ ] Build image: `docker build -t dosboat-freedos build/freedos-image`
- [ ] Verify build success (no errors)
- [ ] Check image size: `docker images dosboat-freedos`
- [ ] Verify image layers contain QEMU and noVNC

### Podman
- [ ] Build image: `podman build -t dosboat-freedos build/freedos-image`
- [ ] Verify build success (no errors)
- [ ] Check image size: `podman images dosboat-freedos`

## Application Testing

### Development Mode
- [ ] Install dependencies: `bun install`
- [ ] Start dev mode: `bun run dev`
- [ ] Verify application launches without errors
- [ ] Check console for any TypeScript errors

### Installation Flow - Default Settings
- [ ] Launch DOSBoat
- [ ] Begin installation wizard
- [ ] Verify default install location: `~/dosboat/`
- [ ] Use default settings (1GB RAM, 2GB disk)
- [ ] Complete installation
- [ ] Verify compose file created (check docker-compose.yml or podman-compose.yml)
- [ ] Verify container starts successfully
- [ ] Check container logs for entrypoint execution
- [ ] Verify overlay disk created: `ls ~/dosboat/disk.qcow2`
- [ ] Verify overlay has correct backing file: `qemu-img info ~/dosboat/disk.qcow2`
- [ ] Access noVNC interface
- [ ] Verify FreeDOS boots from overlay
- [ ] Verify FreeDOS is functional (run DIR, navigate, etc.)

### Installation Flow - Custom Location
- [ ] Reset DOSBoat configuration
- [ ] Begin installation wizard
- [ ] Choose custom install location (e.g., `/tmp/dosboat-test`)
- [ ] Complete installation
- [ ] Verify overlay created at custom location
- [ ] Verify FreeDOS boots correctly
- [ ] Clean up: Remove custom location folder

### Installation Flow - Large Disk
- [ ] Reset DOSBoat configuration
- [ ] Begin installation wizard
- [ ] Set disk size to 5GB (> 1GB base)
- [ ] Complete installation
- [ ] Verify overlay disk created
- [ ] Check overlay size: `qemu-img info ~/dosboat/disk.qcow2`
- [ ] Expected: virtual-size = 5GB
- [ ] Boot FreeDOS and verify disk size inside DOS (e.g., `CHKDSK` or `FDISK`)

### Installation Flow - Custom ISO
- [ ] Download or prepare a different DOS ISO (or use FD14LIVE.iso as test)
- [ ] Reset DOSBoat configuration
- [ ] Begin installation wizard
- [ ] Select "Use custom ISO"
- [ ] Choose the ISO file
- [ ] Complete installation
- [ ] Verify CUSTOM_ISO environment variable set in compose file
- [ ] Verify ISO mounted in volumes section
- [ ] Boot and verify it boots from custom ISO
- [ ] Verify overlay disk also attached

### Resource Configuration
- [ ] Test with minimum RAM (0.5GB = 512MB)
- [ ] Test with maximum RAM (8GB)
- [ ] Test with minimum disk (2GB)
- [ ] Test with maximum disk (64GB)
- [ ] Test with 1 CPU core
- [ ] Test with 4 CPU cores

### Serial Port Integration
- [ ] Configure serial port passthrough
- [ ] Verify device mapping in compose file
- [ ] Verify QEMU serial arguments in `ARGUMENTS` env var
- [ ] Boot FreeDOS
- [ ] Test serial port functionality (if hardware available)

### Container Management
- [ ] Start VM from DOSBoat
- [ ] Verify container running: `docker ps` or `podman ps`
- [ ] Stop VM from DOSBoat
- [ ] Verify container stops gracefully
- [ ] Verify 120s grace period respected
- [ ] Restart VM
- [ ] Verify persistence (changes made earlier still present)

### Network Access
- [ ] Verify noVNC port mapping (47270-47279 for Docker, random for Podman)
- [ ] Access VNC via web browser: `http://localhost:<port>`
- [ ] Verify QMP port mapping (47290-47299 for Docker, random for Podman)
- [ ] Test QMP connectivity (if QMP client available)

### Base Image Protection
- [ ] Start VM
- [ ] Make changes in FreeDOS (create files, modify config)
- [ ] Stop VM
- [ ] Verify base image unchanged: `qemu-img info images/FD14-base.qcow2`
- [ ] Verify changes only in overlay: `qemu-img info ~/dosboat/disk.qcow2`

### Reset/Reinstall
- [ ] Complete an installation
- [ ] Make changes in FreeDOS
- [ ] Trigger reinstall from DOSBoat
- [ ] Verify old overlay deleted
- [ ] Verify new overlay created from base
- [ ] Verify changes lost (fresh FreeDOS)

### Error Handling
- [ ] Try to start without base image (rename it temporarily)
- [ ] Expected: Error message about missing base.qcow2
- [ ] Restore base image
- [ ] Try to install to a non-existent directory
- [ ] Expected: Error or automatic directory creation
- [ ] Try to install with insufficient disk space
- [ ] Expected: Error message before installation

## Regression Testing

### Shared Folder
- [ ] Enable shared folder mapping
- [ ] Verify volume mapping in compose file
- [ ] Boot FreeDOS
- [ ] Verify access to /shared (if FreeVNC supports file browsing)

### USB Passthrough
- [ ] Configure USB passthrough (if hardware available)
- [ ] Verify /dev/bus/usb volume mount
- [ ] Boot FreeDOS
- [ ] Test USB device interaction

## Performance Testing
- [ ] Measure cold start time (first boot after install)
- [ ] Measure warm start time (subsequent boots)
- [ ] Measure overlay disk growth over time
- [ ] Verify KVM acceleration active (check QEMU logs)

## Documentation Verification
- [ ] Follow README instructions exactly
- [ ] Verify all commands work as documented
- [ ] Check for any missing steps
- [ ] Verify all paths and filenames correct
- [ ] Test helper script: `./scripts/create-base-image.sh`

## Cross-Runtime Testing
- [ ] Test same configuration with Docker
- [ ] Test same configuration with Podman
- [ ] Verify both produce identical FreeDOS environments
- [ ] Test switching between runtimes (uninstall and reinstall)

## Edge Cases
- [ ] Install to path with spaces (e.g., `/home/user/my dos boat`)
- [ ] Install to path with special characters
- [ ] Install with very long path
- [ ] Simultaneously run multiple instances (if supported)
- [ ] Test with SELinux enforcing (Fedora/RHEL)
- [ ] Test with AppArmor enabled (Ubuntu)

## Cleanup Testing
- [ ] Uninstall DOSBoat
- [ ] Verify cleanup of containers
- [ ] Verify cleanup of compose files
- [ ] Verify install folder NOT deleted (user data preserved)
- [ ] Verify base image NOT deleted (can be reused)

## Final Checks
- [ ] No TypeScript errors in build
- [ ] No runtime errors in console
- [ ] No Docker/Podman errors in logs
- [ ] Application responsive and stable
- [ ] Memory usage reasonable
- [ ] No resource leaks (check with multiple install/uninstall cycles)

---

## Test Results Summary

Date: __________
Tester: __________

### Pass Rate
- Total Tests: _____ 
- Passed: _____
- Failed: _____
- Skipped: _____

### Critical Issues Found
1. 
2. 
3. 

### Non-Critical Issues
1. 
2. 
3. 

### Notes
