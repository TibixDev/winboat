#!/bin/bash
set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   WINBOAT - ONE CLICK COMPLETE INSTALLATION              ║"
echo "║   This installs EVERYTHING and configures your system    ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "This will take 10-15 minutes. Please wait..."
echo ""

# Check for xrdp service and port conflicts
echo "→ Checking for port conflicts..."
XRDP_RUNNING=false
if systemctl is-active --quiet xrdp 2>/dev/null; then
    XRDP_RUNNING=true
    echo ""
    echo "⚠️  WARNING: xrdp is running on port 3389"
    echo "   WinBoat needs this port for Remote Desktop connection to Windows VM"
    echo ""
    echo "Options:"
    echo "  1. Stop xrdp temporarily (can restart later)"
    echo "  2. Stop and disable xrdp (won't start on boot)"
    echo "  3. Continue anyway (installation may fail)"
    echo ""
    read -p "Choose option [1/2/3]: " -n 1 -r XRDP_CHOICE
    echo ""
    
    case $XRDP_CHOICE in
        1)
            echo "→ Stopping xrdp..."
            sudo systemctl stop xrdp
            echo "✓ xrdp stopped (will start again on next reboot)"
            ;;
        2)
            echo "→ Stopping and disabling xrdp..."
            sudo systemctl stop xrdp
            sudo systemctl disable xrdp
            echo "✓ xrdp stopped and disabled"
            ;;
        3)
            echo "⚠️  Continuing with xrdp running - installation may fail"
            ;;
        *)
            echo "Invalid choice. Stopping xrdp temporarily..."
            sudo systemctl stop xrdp
            ;;
    esac
    echo ""
fi

# Check if port 3389 is still in use after handling xrdp
if ss -tuln | grep -q ':3389 ' 2>/dev/null; then
    if ! ss -tuln | grep ':3389 ' | grep -q '127.0.0.1:3389'; then
        echo "⚠️  WARNING: Port 3389 is still in use by another service!"
        echo "   Check with: sudo ss -tuln | grep 3389"
        echo ""
        read -p "Continue anyway? [y/N] " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Installation cancelled. Please free port 3389 and try again."
            exit 1
        fi
    fi
fi


# Remove old packages
echo "→ Removing old Docker packages..."
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do 
    sudo apt-get remove -y $pkg 2>/dev/null || true
done

# Install Docker (official)
echo "→ Installing Docker..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker
echo "→ Starting Docker..."
sudo systemctl start docker
sudo systemctl enable docker.service
sudo systemctl enable containerd.service

# Add user to docker group
echo "→ Configuring Docker permissions..."
sudo groupadd docker 2>/dev/null || true
sudo usermod -aG docker $USER

# Install FreeRDP (CRITICAL!)
echo "→ Installing FreeRDP..."
sudo apt-get update
if sudo apt-get install -y freerdp3-x11; then
    echo "✓ FreeRDP 3.x installed"
else
    sudo apt-get install -y freerdp2-x11
    echo "✓ FreeRDP 2.x installed"
fi

# Configure Firewall
echo "→ Configuring firewall for WinBoat..."
if command -v ufw &> /dev/null; then
    sudo ufw allow 3389/tcp comment 'WinBoat RDP' 2>/dev/null || true
    sudo ufw allow 3389/udp comment 'WinBoat RDP' 2>/dev/null || true
    sudo ufw allow 7148:7149/tcp comment 'WinBoat Guest API' 2>/dev/null || true
    sudo ufw allow 8006/tcp comment 'WinBoat noVNC' 2>/dev/null || true
    sudo ufw allow 137/udp comment 'Samba NetBIOS' 2>/dev/null || true
    sudo ufw allow 138/udp comment 'Samba NetBIOS' 2>/dev/null || true
    sudo ufw allow 139/tcp comment 'Samba NetBIOS' 2>/dev/null || true
    sudo ufw allow 445/tcp comment 'Samba SMB' 2>/dev/null || true
    echo "✓ Firewall configured (including file sharing)"
fi

# Install WinBoat
echo "→ Installing WinBoat..."
cd ~/Downloads
curl -L -o winboat.deb $(curl -s https://api.github.com/repos/TibixDev/winboat/releases/latest | grep "browser_download_url.*amd64.deb" | cut -d '"' -f 4)
sudo apt install -y ./winboat.deb

# Create desktop shortcut
echo "→ Creating desktop shortcut..."
cat > ~/Desktop/WinBoat.desktop << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=WinBoat
Comment=Run Windows Apps on Linux
Exec=winboat
Icon=winboat
Terminal=false
Categories=Utility;
EOF
chmod +x ~/Desktop/WinBoat.desktop

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                  ✓ INSTALLATION COMPLETE                  ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "IMPORTANT NOTES:"
if [ "$XRDP_RUNNING" = true ]; then
    echo "  • xrdp was detected and handled during installation"
    echo "  • After reboot, WinBoat will use port 3389 for Windows RDP"
    if [ "$XRDP_CHOICE" = "1" ]; then
        echo "  • xrdp will auto-start on reboot (may cause conflicts)"
        echo "    To prevent this, run: sudo systemctl disable xrdp"
    fi
fi
echo "  • Docker group membership requires a FULL RESTART to take effect"
echo "  • After restart, launch WinBoat from the desktop icon"
echo ""
echo "NEXT STEP: You MUST restart your computer now!"
echo ""
read -p "Press Enter to RESTART NOW, or Ctrl+C to restart later..."
sudo reboot
