# WinBoat Uninstall Summary

## ✅ Successfully Removed (No sudo required)

1. **Configuration Directories:**
   - `~/.winboat` - Removed ✓
   - `~/.config/winboat` - Removed ✓

2. **User Desktop Files:**
   - All `~/.local/share/applications/winboat-*.desktop` files - Removed ✓

3. **Docker/Podman Containers:**
   - No active containers found - Clean ✓

## ⚠️ Requires Manual Removal (sudo required)

The following items require root privileges to remove. Run these commands:

```bash
# Remove WinBoat package
sudo dpkg -r winboat

# Remove system binary
sudo rm -f /usr/bin/winboat

# Remove system desktop file
sudo rm -f /usr/share/applications/winboat.desktop

# Remove alternatives entry (if exists)
sudo update-alternatives --remove winboat /usr/bin/winboat 2>/dev/null || true
```

## 📦 Preserved (As Requested)

The following system dependencies were **NOT** removed (as requested):

- ✅ Docker / Docker Compose
- ✅ Podman / Podman Compose  
- ✅ FreeRDP
- ✅ Other system libraries and prerequisites

## 💾 Windows VM Storage

The Windows VM storage location was found at:
- `~/winboat-dev/winboat`

This location contains your Windows installation data. It was **NOT** automatically removed to prevent data loss. If you want to remove it, you can do so manually:

```bash
# WARNING: This will delete your entire Windows VM installation
rm -rf ~/winboat-dev/winboat
```

## Verification

After running the sudo commands above, verify removal:

```bash
# Check package
dpkg -l | grep winboat

# Check binary
ls -la /usr/bin/winboat

# Check desktop file
ls -la /usr/share/applications/winboat.desktop

# Check config directories
ls -la ~/.winboat ~/.config/winboat
```

All should return "No such file or directory" or empty results.


