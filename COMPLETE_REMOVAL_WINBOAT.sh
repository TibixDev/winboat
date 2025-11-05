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

# Stop containers matching winboat
CONTAINERS=$(docker ps -aq --filter "name=winboat" 2>/dev/null || true)
if [ -n "$CONTAINERS" ]; then
    docker stop $CONTAINERS 2>/dev/null || true
    docker rm $CONTAINERS 2>/dev/null || true
    print_success "Removed WinBoat containers"
else
    print_success "No WinBoat containers found"
fi

# Stop containers using Windows image
WINDOWS_CONTAINERS=$(docker ps -aq --filter "ancestor=ghcr.io/dockur/windows" 2>/dev/null || true)
if [ -n "$WINDOWS_CONTAINERS" ]; then
    docker stop $WINDOWS_CONTAINERS 2>/dev/null || true
    docker rm $WINDOWS_CONTAINERS 2>/dev/null || true
    print_success "Removed Windows containers"
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
# 8. Clean Docker System
# ============================================
print_status "Cleaning Docker system..."

docker system prune -f >/dev/null 2>&1 || true
print_success "Docker system cleaned"

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
echo "To reinstall WinBoat with your fixes:"
echo "  1. Reboot your system (recommended)"
echo "  2. Run: cd winboat-repo && npm run dev"
echo "  3. Or use the 1-click installer"
echo ""
