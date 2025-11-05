# Port 3389 Conflict Detection and Resolution

## Summary

This contribution addresses [GitHub Issue #XX] regarding port 3389 conflicts with xrdp during WinBoat installation.

## Problem Statement

Users running xrdp (Remote Desktop Protocol server for Linux) encounter installation failures because port 3389 is already in use. The error manifests as:

```
Error response from daemon: failed to set up container networking: 
driver failed programming external connectivity on endpoint WinBoat:
failed to bind host port for 0.0.0.0:3389:172.18.0.2:3389/tcp: address already in use
```

This issue was reported in version 0.8.7 and affects users on Ubuntu 24.04 LTS with LXQt desktop environment.

## Solution Implemented

### 1. Port Conflict Detection (`src/renderer/lib/specs.ts`)

Added `checkRDPPort()` function that:
- Checks if xrdp service is active using `systemctl`
- Verifies if port 3389 is in use (excluding localhost bindings)
- Returns status for both checks

Updated `Specs` type to include:
- `rdpPortAvailable`: boolean indicating if port 3389 is available
- `xrdpRunning`: boolean indicating if xrdp service is active

### 2. Prerequisites UI Update (`src/renderer/views/SetupUI.vue`)

Added new prerequisite check item that:
- Shows ✔ (green) when port is available and xrdp is not running
- Shows ⚠ (yellow) with warning when there's a conflict
- Provides inline instructions: `sudo systemctl stop xrdp`
- Differentiates between xrdp and other port conflicts

### 3. Comprehensive Documentation (`TROUBLESHOOTING.md`)

Created troubleshooting guide covering:
- Problem identification
- Root cause explanation
- Multiple solution options:
  - Stopping xrdp service
  - Checking for other services
  - Resetting installation

### 4. Type Definitions (`src/types.ts`)

Updated `Specs` type to support new port checking functionality.

## Technical Details

### Port Detection Logic

```typescript
export async function checkRDPPort() {
    const result = {
        available: true,
        xrdpRunning: false,
    };

    // Check xrdp service status
    const { stdout: xrdpStatus } = await execAsync(
        "systemctl is-active xrdp 2>/dev/null || echo 'inactive'"
    );
    result.xrdpRunning = xrdpStatus.trim() === "active";

    // Check port 3389 availability (excluding localhost)
    const { stdout: portCheck } = await execAsync(
        "ss -tuln | grep ':3389 ' | grep -v '127.0.0.1:3389' || echo 'available'"
    );
    result.available = portCheck.trim() === "available";

    return result;
}
```

### UI Warning Display

The warning appears in the Prerequisites step and provides context-aware messages:

- If xrdp is running: Shows command to stop it
- If port is in use by other service: Shows generic warning
- If everything is OK: Shows green checkmark

## Benefits

1. **Proactive Detection**: Users are warned before installation fails
2. **Clear Instructions**: Inline command provided for common case (xrdp)
3. **Better UX**: No cryptic Docker errors during installation
4. **Documentation**: Comprehensive troubleshooting guide for all scenarios

## Testing Recommendations

### Test Case 1: xrdp Running
```bash
sudo systemctl start xrdp
# Launch WinBoat installer
# Verify warning appears in Prerequisites
```

### Test Case 2: Port Already in Use
```bash
# Bind port 3389 with netcat
nc -l 3389 &
# Launch WinBoat installer
# Verify warning appears
```

### Test Case 3: Clean System
```bash
sudo systemctl stop xrdp
# Ensure nothing on port 3389
sudo ss -tuln | grep 3389
# Launch WinBoat installer
# Verify green checkmark
```

## Files Modified

1. `src/types.ts` - Added `rdpPortAvailable` and `xrdpRunning` fields to `Specs` type
2. `src/renderer/lib/specs.ts` - Added `checkRDPPort()` function and integrated into `getSpecs()`
3. `src/renderer/views/SetupUI.vue` - Added port conflict warning in Prerequisites UI
4. `TROUBLESHOOTING.md` - New file with comprehensive troubleshooting guide

## Backward Compatibility

- No breaking changes
- Existing installations unaffected
- Port range mapping (47300-47309) still used in Docker configuration
- Warning is informational only; installation can proceed (though may fail)

## Future Enhancements

Potential improvements for future versions:

1. **Auto-fix**: Offer to automatically stop xrdp during installation
2. **Service Integration**: Manage xrdp service lifecycle (stop before install, restart after)
3. **Custom Port Configuration**: Allow users to specify alternative RDP port
4. **Advanced Detection**: Check for all services that might conflict

## References

- Original Issue: [GitHub Issue #XX]
- User Report: Ubuntu 24.04.3 LTS, LXQt 1.4.0
- Docker Error: https://docs.docker.com/config/containers/container-networking/
- Port Range Implementation: `src/renderer/data/docker.ts` (lines 30-31)

## Contributor Notes

This fix implements Solution 1 and Solution 2 from the original GitHub issue:
- ✅ Solution 1: Add port check to Pre-Requisites window
- ✅ Solution 2: Update documentation with xrdp conflict warning
- ⚠️ Solution 3: Custom port configuration (not implemented - port ranges already handle this)

---

**Author**: Automated fix based on user-reported issue
**Date**: November 2025
**Version**: Targets WinBoat v0.9.0+
