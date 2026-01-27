#!/bin/bash
#
# WinBoat CLI Installer
# 
# This script:
# 1. Creates a symlink to WinBoat CLI in ~/.local/bin
# 2. Registers WinBoat as the default handler for .exe and .msi files
# 3. Integrates WinBoat into the Linux desktop environment
#

set -e

CLI_SCRIPT="$(pwd)/scripts/winboat-cli.ts"
INSTALL_DIR="$HOME/.local/bin"
SYMLINK_PATH="$INSTALL_DIR/winboat"
DESKTOP_DIR="$HOME/.local/share/applications"
MIME_DIR="$HOME/.local/share/mime/packages"

echo "======================================"
echo "WinBoat CLI Installer"
echo "======================================"
echo ""

# Check if CLI script exists
if [ ! -f "$CLI_SCRIPT" ]; then
    echo "Error: CLI script not found at $CLI_SCRIPT"
    echo "Please run this script from the WinBoat project root directory."
    exit 1
fi

# Create directories if they don't exist
mkdir -p "$INSTALL_DIR"
mkdir -p "$DESKTOP_DIR"
mkdir -p "$MIME_DIR"

# Remove existing symlink if it exists
if [ -L "$SYMLINK_PATH" ]; then
    echo "Removing existing symlink..."
    rm "$SYMLINK_PATH"
fi

# Create symlink
echo "Creating symlink: $SYMLINK_PATH -> $CLI_SCRIPT"
ln -s "$CLI_SCRIPT" "$SYMLINK_PATH"

# Make CLI script executable
chmod +x "$CLI_SCRIPT"

# Create desktop entry for WinBoat
echo "Creating desktop entry..."
cat > "$DESKTOP_DIR/winboat-installer.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Name=WinBoat Installer
Comment=Install Windows applications via WinBoat
Exec=winboot-install-handler %f
Icon=system-software-install
Terminal=false
NoDisplay=true
MimeType=application/x-msdownload;application/x-msi;application/x-ms-dos-executable;
Categories=System;
EOF

# Create the install handler wrapper script
echo "Creating install handler..."
cat > "$INSTALL_DIR/winboot-install-handler" << 'EOF'
#!/bin/bash
# WinBoat Install Handler
# This script is called when .exe or .msi files are opened

FILE="$1"

if [ -z "$FILE" ]; then
    zenity --error --text="No file specified" --title="WinBoat Installer" 2>/dev/null || \
    notify-send "WinBoat Installer" "No file specified" || \
    echo "Error: No file specified"
    exit 1
fi

# Show confirmation dialog
if command -v zenity &> /dev/null; then
    if ! zenity --question \
        --title="WinBoat Installer" \
        --text="Install $(basename "$FILE") in Windows?\n\nThis will launch the installer in your WinBoat Windows VM." \
        --width=400; then
        exit 0
    fi
    
    # Show progress
    (
        echo "# Uploading installer to Windows VM..."
        winboat -i "$FILE"
    ) | zenity --progress \
        --title="WinBoat Installer" \
        --text="Installing $(basename "$FILE")..." \
        --pulsate \
        --auto-close \
        --no-cancel 2>/dev/null &
    
    # Run installation in background
    winboat -i "$FILE" &
else
    # Fallback without GUI
    notify-send "WinBoat Installer" "Installing $(basename "$FILE") in Windows..." 2>/dev/null || true
    winboat -i "$FILE" &
fi
EOF

chmod +x "$INSTALL_DIR/winboot-install-handler"

# Register MIME types
echo "Registering MIME types..."
cat > "$MIME_DIR/winboat-mimetypes.xml" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
    <mime-type type="application/x-msdownload">
        <comment>Windows Executable</comment>
        <glob pattern="*.exe"/>
        <glob pattern="*.EXE"/>
    </mime-type>
    <mime-type type="application/x-msi">
        <comment>Windows Installer Package</comment>
        <glob pattern="*.msi"/>
        <glob pattern="*.MSI"/>
    </mime-type>
</mime-info>
EOF

# Update MIME database
echo "Updating MIME database..."
update-mime-database "$HOME/.local/share/mime" 2>/dev/null || true

# Set WinBoat as default handler for .exe and .msi files
echo "Setting WinBoat as default handler..."
xdg-mime default winboat-installer.desktop application/x-msdownload 2>/dev/null || true
xdg-mime default winboat-installer.desktop application/x-msi 2>/dev/null || true
xdg-mime default winboat-installer.desktop application/x-ms-dos-executable 2>/dev/null || true

# Update desktop database
update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

echo ""
echo "======================================"
echo "✓ WinBoat CLI installed successfully!"
echo "======================================"
echo ""
echo "What's been set up:"
echo ""
echo "  1. CLI Command:"
echo "     - Symlink created: $SYMLINK_PATH"
echo "     - You can now run: winboat --help"
echo ""
echo "  2. File Associations:"
echo "     - .exe and .msi files will open with WinBoat"
echo "     - Double-clicking installers will install in Windows"
echo "     - Right-click → Open With → WinBoat Installer"
echo ""
echo "  3. Desktop Integration:"
echo "     - Desktop entry created in: $DESKTOP_DIR"
echo "     - MIME types registered for Windows executables"
echo ""
echo "To complete the setup, add WinBoat to your PATH:"
echo ""
echo "  For bash:"
echo "    echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc"
echo "    source ~/.bashrc"
echo ""
echo "  For zsh:"
echo "    echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc"
echo "    source ~/.zshrc"
echo ""
echo "Then you can:"
echo "  - Run: winboat --help"
echo "  - Double-click .exe/.msi files to install in Windows"
echo "  - Drag-and-drop installers to install them"
echo ""
echo "Enjoy seamless Windows app installation on Linux! 🐧🪟"
echo ""
