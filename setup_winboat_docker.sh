#!/bin/bash

echo "==================================="
echo "WinBoat Docker Setup Script"
echo "==================================="
echo ""

# Check for xrdp and port conflicts
echo "🔍 Checking for port conflicts..."
if systemctl is-active --quiet xrdp 2>/dev/null; then
    echo ""
    echo "⚠️  WARNING: xrdp is running and uses port 3389"
    echo "   WinBoat needs this port for Windows Remote Desktop"
    echo ""
    read -p "Stop xrdp service now? [Y/n] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        sudo systemctl stop xrdp
        echo "✓ xrdp stopped"
    else
        echo "⚠️  xrdp still running - may cause conflicts"
    fi
    echo ""
fi


# Install Docker and Docker Compose
echo "📦 Installing Docker and Docker Compose..."
sudo apt update
sudo apt install -y docker.io docker-compose-plugin docker-buildx-plugin

echo ""
echo "🚀 Starting Docker service..."
sudo systemctl start docker
sudo systemctl enable docker.service

echo ""
echo "👤 Adding $USER to docker group..."
sudo usermod -aG docker $USER

echo ""
echo "✅ Setup Complete!"
echo ""
echo "⚠️  IMPORTANT: You MUST log out and log back in (or reboot)"
echo "    for the docker group changes to take effect."
echo ""
echo "📝 NOTES:"
echo "  • If xrdp was stopped, it will start again on next reboot"
echo "  • To disable xrdp permanently: sudo systemctl disable xrdp"
echo "  • Check port status: sudo ss -tuln | grep 3389"
echo ""
echo "After logging back in, run 'winboat' to continue setup."
echo ""
