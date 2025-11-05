#!/bin/bash

# ============================================
# WinBoat Complete Removal Script
# ============================================
# This script completely removes ALL WinBoat 
# installations, containers, images, volumes,
# and configuration files.
# ============================================

set -e

echo "╔═══════════════════════════════════════════╗"
echo "║   WinBoat Complete Removal Script        ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Function to print status
print_status() {
    echo -e "\n→ $1"
}

print_success() {
    echo -e "  ✓ $1"
}

print_warning() {
    echo -e "  ⚠ $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_warning "Please run as normal user (not root). Sudo will be used when needed."
    exit 1
fi

echo "This script will remove:"
echo "  • All WinBoat Docker containers"
echo "  • All WinBoat Docker images and volumes  "
echo "  • WinBoat configuration files"
echo "  • WinBoat AppImage/binaries"
echo "  • Docker compose files"
echo ""
read -p "Are you ABSOLUTELY sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

# ============================================
# 1. Stop and Remove Docker Containers
# ============================================
print_status "Stopping WinBoat containers..."

# Stop and remove ALL containers matching winboat (case-insensitive)
CONTAINERS=$(docker ps -aq --filter "name=winboat" 2>/dev/null || true)
CONTAINERS+=" $(docker ps -aq --filter "name=WinBoat" 2>/dev/null || true)"
if [ -n "$CONTAINERS" ]; then
    # Force stop and remove (trim whitespace)
    CONTAINERS=$(echo $CONTAINERS | tr -s ' ')
    docker stop $CONTAINERS 2>/dev/null || true
    docker rm -f $CONTAINERS 2>/dev/null || true
    print_success "Removed WinBoat containers"
else
    print_success "No WinBoat containers found"
fi

# Stop and remove ALL containers using Windows image
WINDOWS_CONTAINERS=$(docker ps -aq --filter "ancestor=ghcr.io/dockur/windows" 2>/dev/null || true)
if [ -n "$WINDOWS_CONTAINERS" ]; then
    docker stop $WINDOWS_CONTAINERS 2>/dev/null || true
    docker rm -f $WINDOWS_CONTAINERS 2>/dev/null || true
    print_success "Removed Windows containers"
else
    print_success "No Windows containers found"
fi

# ============================================
# 2. Remove Docker Images
# ============================================
print_status "Removing Docker images..."

# Remove Windows image
if docker images | grep -q "dockur/windows"; then
    docker rmi ghcr.io/dockur/windows:latest 2>/dev/null || true
    docker rmi ghcr.io/dockur/windows:5.07 2>/dev/null || true
    docker image prune -f >/dev/null 2>&1
    print_success "Removed Windows Docker images"
else
    print_success "No Windows images found"
fi

# ============================================
# 3. Remove Docker Volumes
# ============================================
print_status "Removing Docker volumes..."

VOLUMES=$(docker volume ls -q | grep -i winboat 2>/dev/null || true)
if [ -n "$VOLUMES" ]; then
    echo "$VOLUMES" | xargs docker volume rm 2>/dev/null || true
    print_success "Removed WinBoat volumes"
else
    print_success "No WinBoat volumes found"
fi

# ============================================
# 4. Remove Configuration Files
# ============================================
print_status "Removing configuration files..."

# Remove WinBoat config directory
if [ -d "$HOME/.config/winboat" ]; then
    rm -rf "$HOME/.config/winboat"
    print_success "Removed ~/.config/winboat"
else
    print_success "No config directory found"
fi

# Remove WinBoat data directory
if [ -d "$HOME/.local/share/winboat" ]; then
    rm -rf "$HOME/.local/share/winboat"
    print_success "Removed ~/.local/share/winboat"
fi

# ============================================
# 5. Remove Docker Compose Files
# ============================================
print_status "Looking for docker-compose files..."

# Common locations for compose files
COMPOSE_LOCATIONS=(
    "$HOME/docker"
    "$HOME/winboat"
    "$HOME/.winboat"
    "$HOME/Documents/winboat"
)

for location in "${COMPOSE_LOCATIONS[@]}"; do
    if [ -d "$location" ]; then
        if [ -f "$location/docker-compose.yml" ] || [ -f "$location/compose.yml" ]; then
            echo "  Found compose file in: $location"
            read -p "    Remove this directory? (y/n): " remove_dir
            if [ "$remove_dir" = "y" ]; then
                rm -rf "$location"
                print_success "Removed $location"
            fi
        fi
    fi
done

# ============================================
# 6. Remove WinBoat AppImage/Binaries
# ============================================
print_status "Looking for WinBoat binaries..."

# Check common installation locations
BINARY_LOCATIONS=(
    "$HOME/.local/bin/winboat"
    "$HOME/bin/winboat"
    "/usr/local/bin/winboat"
    "$HOME/Applications/winboat"
    "$HOME/.local/share/applications/winboat"
)

for location in "${BINARY_LOCATIONS[@]}"; do
    if [ -e "$location" ]; then
        print_success "Found: $location"
        if [[ "$location" == /usr/* ]]; then
            sudo rm -rf "$location" 2>/dev/null || true
        else
            rm -rf "$location" 2>/dev/null || true
        fi
        print_success "Removed $location"
    fi
done

# Remove AppImages
find "$HOME" -maxdepth 3 -name "*winboat*.AppImage" 2>/dev/null | while read -r appimage; do
    print_success "Found AppImage: $appimage"
    read -p "    Remove? (y/n): " remove_appimage
    if [ "$remove_appimage" = "y" ]; then
        rm -f "$appimage"
        print_success "Removed $appimage"
    fi
done

# ============================================
# 7. Remove Desktop Files
# ============================================
print_status "Removing desktop entries..."

if [ -f "$HOME/.local/share/applications/winboat.desktop" ]; then
    rm -f "$HOME/.local/share/applications/winboat.desktop"
    print_success "Removed desktop entry"
fi

# ============================================
# 8. Remove WinBoat Installation Directories
# ============================================
print_status "Removing WinBoat installation directories..."

# Common installation locations (including development installs)
INSTALL_LOCATIONS=(
    "$HOME/winboat-dev"
    "$HOME/winboat"
    "$HOME/.winboat"
)

for location in "${INSTALL_LOCATIONS[@]}"; do
    if [ -d "$location" ]; then
        print_success "Found installation: $location"
        rm -rf "$location"
        print_success "Removed $location (including all hidden files and configs)"
    fi
done

# Also check for any winboat directories in home
find "$HOME" -maxdepth 1 -type d -name "*winboat*" 2>/dev/null | while read -r winboat_dir; do
    if [[ "$winboat_dir" != *"winboat-repo"* ]]; then
        print_success "Found additional WinBoat directory: $winboat_dir"
        read -p "    Remove this directory? (y/n): " remove_extra
        if [ "$remove_extra" = "y" ]; then
            rm -rf "$winboat_dir"
            print_success "Removed $winboat_dir"
        fi
    fi
done

# ============================================
# 9. Clean Docker System
# ============================================
print_status "Cleaning Docker system..."

docker system prune -f >/dev/null 2>&1 || true
print_success "Docker system cleaned"

# ============================================
# 10. Setup Stage 2 Auto-Install
# ============================================
print_status "Setting up Stage 2 automatic installation..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE2_SCRIPT="$SCRIPT_DIR/INSTALL_WINBOAT_STAGE2.sh"

if [ ! -f "$STAGE2_SCRIPT" ]; then
    print_warning "Stage 2 installer not found at: $STAGE2_SCRIPT"
    print_warning "Stage 2 auto-install will be skipped"
    SKIP_STAGE2=true
else
    # Make Stage 2 script executable
    chmod +x "$STAGE2_SCRIPT"
    
    # Create systemd user service directory
    mkdir -p "$HOME/.config/systemd/user"
    
    # Create systemd user service that opens a terminal for password input
    cat > "$HOME/.config/systemd/user/winboat-stage2-install.service" << EOFSERVICE
[Unit]
Description=WinBoat Stage 2 Installation (Post-Reboot)
After=graphical-session.target

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'sleep 5 && gnome-terminal --title="WinBoat Stage 2 Installation" --wait -- bash -c "$STAGE2_SCRIPT; echo; echo Press Enter to close...; read"'
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOFSERVICE

    # Enable the service
    systemctl --user daemon-reload
    systemctl --user enable winboat-stage2-install.service
    
    print_success "Stage 2 auto-install configured"
    print_success "Will run automatically 30 seconds after next login"
    SKIP_STAGE2=false
fi

echo ""

# ============================================
# Summary
# ============================================
echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║   WinBoat Removal Complete!               ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "All WinBoat components have been removed."
echo ""
echo "Remaining Docker storage:"
docker system df || true
echo ""

if [ "$SKIP_STAGE2" = false ]; then
    echo "╔═══════════════════════════════════════════════════════╗"
    echo "║     AUTOMATIC STAGE 2 INSTALLATION CONFIGURED         ║"
    echo "╚═══════════════════════════════════════════════════════╝"
    echo ""
    echo "After reboot, Stage 2 will automatically:"
    echo "  1. Wait 30 seconds for desktop to load"
    echo "  2. Update your system (apt update && upgrade)"
    echo "  3. Install all dependencies (Docker, Node.js, FreeRDP)"
    echo "  4. Clone WinBoat from: sprinteroz/winboat"
    echo "  5. Install and launch WinBoat"
    echo ""
    echo "Your system will now reboot in 10 seconds..."
    echo "Press Ctrl+C to cancel the reboot"
    echo ""
    
    sleep 10
    echo "Rebooting now..."
    sudo reboot
else
    echo "To reinstall WinBoat manually:"
    echo "  1. Reboot your system (recommended)"
    echo "  2. Run: cd winboat-repo && npm run dev"
    echo "  3. Or use the 1-click installer"
    echo ""
fi
