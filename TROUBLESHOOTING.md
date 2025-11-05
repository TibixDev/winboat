# WinBoat Troubleshooting Guide

This guide helps you resolve common issues when using WinBoat.

## Table of Contents
- [Port 3389 Conflict (xrdp)](#port-3389-conflict-xrdp)
- [Installation Issues](#installation-issues)

---

## Port 3389 Conflict (xrdp)

### Problem

When installing WinBoat, you may encounter an error similar to:

```
Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint WinBoat (...)
failed to bind host port for 0.0.0.0:3389:172.18.0.2:3389/tcp: address already in use
```

### Cause

This error occurs when port 3389 (the standard RDP port) is already in use by another service on your system. The most common culprit is **xrdp**, a Remote Desktop Protocol server for Linux.

### Solution

#### Option 1: Stop xrdp Service (Recommended)

If you have xrdp installed and running, you can stop it before installing WinBoat:

```bash
# Stop xrdp service
sudo systemctl stop xrdp

# (Optional) Disable xrdp from starting on boot
sudo systemctl disable xrdp
```

After stopping xrdp, restart the WinBoat installation process.

#### Option 2: Check for Other Services Using Port 3389

If you don't have xrdp installed, another service might be using port 3389. You can check what's using the port:

```bash
# Check what's listening on port 3389
sudo ss -tuln | grep ':3389'

# Or use lsof
sudo lsof -i :3389
```

Once you identify the service, you can stop it or configure it to use a different port.

#### Option 3: Restart After Stopping xrdp

If you stopped xrdp during installation but still encounter issues:

1. Completely remove WinBoat containers:
   ```bash
   docker stop WinBoat 2>/dev/null || true
   docker rm WinBoat 2>/dev/null || true
   docker volume rm winboat_data 2>/dev/null || true
   ```

2. Ensure xrdp is stopped:
   ```bash
   sudo systemctl stop xrdp
   sudo systemctl status xrdp
   ```

3. Restart WinBoat installation from the beginning.

### Why This Happens

WinBoat needs to expose the Windows RDP port (3389) to allow you to connect to the Windows virtual machine. When xrdp or another service is already using this port, Docker cannot bind to it, causing the installation to fail.

**Note**: Modern versions of WinBoat (v0.9.0+) use port range mapping (47300-47309) which reduces the likelihood of conflicts. If you're running an older version, consider updating to the latest release.

### Prevention

The WinBoat installation wizard now includes a pre-requisite check that warns you if port 3389 is in use or if xrdp is running. Pay attention to this warning during installation and follow the suggested steps to stop xrdp before proceeding.

---

## Installation Issues

For other installation issues, please check:

1. **Logs**: Check `~/.winboat/install.log` for detailed error messages
2. **Docker Logs**: Run `docker logs WinBoat` to see container-specific errors
3. **Prerequisites**: Ensure all system requirements are met (check the Pre-Requisites step in the installer)

### Reset and Try Again

If installation fails, you can reset WinBoat and start over:

```bash
# Stop and remove containers
docker stop WinBoat 2>/dev/null || true
docker rm WinBoat 2>/dev/null || true

# Remove volumes
docker volume rm winboat_data 2>/dev/null || true

# Remove WinBoat directory
rm -rf ~/.winboat

# Restart the WinBoat application
winboat
```

---

## Getting Help

If you continue to experience issues:

1. Check the [WinBoat GitHub Issues](https://github.com/TibixDev/winboat/issues) for similar problems
2. Create a new issue with:
   - Your Linux distribution and version
   - WinBoat version (`winboat --version`)
   - Complete error logs from `~/.winboat/install.log`
   - Output of `docker logs WinBoat`

## Related Issues

- [GitHub Issue #XX](https://github.com/TibixDev/winboat/issues/XX): Port 3389 conflict with xrdp

---

**Last Updated**: November 2025
