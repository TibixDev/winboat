#!/bin/bash

# WinBoat Uninstall Script
# This script removes WinBoat application files while preserving system dependencies
# (Docker, Podman, FreeRDP, etc.)

set -e

echo "=========================================="
echo "WinBoat Uninstall Script"
echo "=========================================="
echo ""
echo "This script will remove:"
echo "  - WinBoat application package"
echo "  - WinBoat configuration files"
echo "  - WinBoat desktop files"
echo "  - WinBoat containers and volumes (if any)"
echo ""
echo "This script will NOT remove:"
echo "  - Docker/Podman (container runtimes)"
echo "  - FreeRDP"
echo "  - Other system dependencies"
echo ""

# Check if running as root for package removal
if [ "$EUID" -ne 0 ]; then 
    echo "Note: Some operations require root privileges."
    echo "You may be prompted for your password."
    echo ""
fi

read -p "Do you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Uninstall cancelled."
    exit 0
fi

echo ""
echo "Starting uninstall process..."
echo ""

# Step 1: Stop any running WinBoat containers
echo "[1/6] Stopping WinBoat containers..."

# Check for Docker containers
if command -v docker &> /dev/null; then
    DOCKER_CONTAINERS=$(docker ps -a --filter "name=winboat" --format "{{.Names}}" 2>/dev/null || true)
    if [ ! -z "$DOCKER_CONTAINERS" ]; then
        echo "  Found Docker containers, stopping and removing..."
        echo "$DOCKER_CONTAINERS" | while read container; do
            if [ ! -z "$container" ]; then
                docker stop "$container" 2>/dev/null || true
                docker rm "$container" 2>/dev/null || true
                echo "    Removed container: $container"
            fi
        done
    fi
    
    # Check for Docker volumes
    DOCKER_VOLUMES=$(docker volume ls --filter "name=winboat" --format "{{.Name}}" 2>/dev/null || true)
    if [ ! -z "$DOCKER_VOLUMES" ]; then
        echo "  Found Docker volumes, removing..."
        echo "$DOCKER_VOLUMES" | while read volume; do
            if [ ! -z "$volume" ]; then
                docker volume rm "$volume" 2>/dev/null || true
                echo "    Removed volume: $volume"
            fi
        done
    fi
fi

# Check for Podman containers
if command -v podman &> /dev/null; then
    PODMAN_CONTAINERS=$(podman ps -a --filter "name=winboat" --format "{{.Names}}" 2>/dev/null || true)
    if [ ! -z "$PODMAN_CONTAINERS" ]; then
        echo "  Found Podman containers, stopping and removing..."
        echo "$PODMAN_CONTAINERS" | while read container; do
            if [ ! -z "$container" ]; then
                podman stop "$container" 2>/dev/null || true
                podman rm "$container" 2>/dev/null || true
                echo "    Removed container: $container"
            fi
        done
    fi
fi

echo "  ✓ Container cleanup complete"
echo ""

# Step 2: Remove WinBoat package
echo "[2/6] Removing WinBoat package..."

if command -v dpkg &> /dev/null && dpkg -l | grep -q winboat; then
    echo "  Found .deb package, removing..."
    sudo dpkg -r winboat 2>/dev/null || sudo apt-get remove -y winboat 2>/dev/null || true
    echo "  ✓ Package removed"
elif command -v rpm &> /dev/null && rpm -qa | grep -q -i winboat; then
    echo "  Found .rpm package, removing..."
    sudo rpm -e winboat 2>/dev/null || true
    echo "  ✓ Package removed"
else
    echo "  No package found (may have been installed manually)"
fi
echo ""

# Step 3: Remove configuration directories
echo "[3/6] Removing configuration directories..."

if [ -d "$HOME/.winboat" ]; then
    echo "  Removing ~/.winboat..."
    rm -rf "$HOME/.winboat"
    echo "  ✓ Removed ~/.winboat"
fi

if [ -d "$HOME/.config/winboat" ]; then
    echo "  Removing ~/.config/winboat..."
    rm -rf "$HOME/.config/winboat"
    echo "  ✓ Removed ~/.config/winboat"
fi

echo "  ✓ Configuration cleanup complete"
echo ""

# Step 4: Remove desktop files
echo "[4/6] Removing desktop files..."

# Remove user desktop files
if [ -d "$HOME/.local/share/applications" ]; then
    DESKTOP_FILES=$(find "$HOME/.local/share/applications" -name "*winboat*" -o -name "*WinBoat*" 2>/dev/null || true)
    if [ ! -z "$DESKTOP_FILES" ]; then
        echo "  Removing user desktop files..."
        echo "$DESKTOP_FILES" | while read file; do
            if [ ! -z "$file" ] && [ -f "$file" ]; then
                rm -f "$file"
                echo "    Removed: $file"
            fi
        done
    fi
fi

# Remove system desktop file (requires root)
if [ -f "/usr/share/applications/winboat.desktop" ]; then
    echo "  Removing system desktop file..."
    sudo rm -f "/usr/share/applications/winboat.desktop" 2>/dev/null || true
    echo "  ✓ Removed system desktop file"
fi

echo "  ✓ Desktop files cleanup complete"
echo ""

# Step 5: Remove binary (if not removed by package)
echo "[5/6] Removing binaries..."

if [ -f "/usr/bin/winboat" ]; then
    echo "  Removing /usr/bin/winboat..."
    sudo rm -f "/usr/bin/winboat" 2>/dev/null || true
    echo "  ✓ Binary removed"
fi

# Check for AppImage in common locations
APPIMAGE_LOCATIONS=(
    "$HOME/Downloads/winboat*.AppImage"
    "$HOME/Applications/winboat*.AppImage"
    "$HOME/.local/bin/winboat*.AppImage"
)

for location in "${APPIMAGE_LOCATIONS[@]}"; do
    if ls $location 1> /dev/null 2>&1; then
        echo "  Found AppImage, removing..."
        rm -f $location
        echo "  ✓ Removed AppImage"
    fi
done

echo "  ✓ Binary cleanup complete"
echo ""

# Step 6: Windows VM storage location
echo "[6/6] Windows VM storage location..."

# Check docker-compose.yml for storage location
STORAGE_LOCATION=""
if [ -f "$HOME/.winboat/docker-compose.yml" ]; then
    STORAGE_LOCATION=$(grep -E "storage|volumes" "$HOME/.winboat/docker-compose.yml" 2>/dev/null | grep -oP "/[^:]+" | head -1 || true)
fi

# Also check common locations
COMMON_STORAGE_LOCATIONS=(
    "$HOME/winboat"
    "$HOME/winboat-dev/winboat"
    "$HOME/.local/share/winboat"
)

echo "  The following locations may contain Windows VM data:"
if [ ! -z "$STORAGE_LOCATION" ] && [ -d "$STORAGE_LOCATION" ]; then
    echo "    - $STORAGE_LOCATION (from docker-compose.yml)"
fi
for location in "${COMMON_STORAGE_LOCATIONS[@]}"; do
    if [ -d "$location" ]; then
        echo "    - $location"
    fi
done

if [ -z "$STORAGE_LOCATION" ] && [ ! -d "$HOME/winboat" ] && [ ! -d "$HOME/winboat-dev/winboat" ] && [ ! -d "$HOME/.local/share/winboat" ]; then
    echo "    (No storage locations found)"
else
    echo ""
    read -p "  Do you want to remove Windows VM storage data? This will delete the entire Windows installation. (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ ! -z "$STORAGE_LOCATION" ] && [ -d "$STORAGE_LOCATION" ]; then
            echo "    Removing $STORAGE_LOCATION..."
            rm -rf "$STORAGE_LOCATION"
            echo "    ✓ Removed"
        fi
        for location in "${COMMON_STORAGE_LOCATIONS[@]}"; do
            if [ -d "$location" ]; then
                echo "    Removing $location..."
                rm -rf "$location"
                echo "    ✓ Removed"
            fi
        done
    else
        echo "    Skipping Windows VM storage removal"
    fi
fi

echo ""
echo "=========================================="
echo "Uninstall complete!"
echo "=========================================="
echo ""
echo "WinBoat has been removed from your system."
echo ""
echo "Note: System dependencies (Docker, Podman, FreeRDP) have been preserved."
echo "If you want to remove them as well, you'll need to do so manually."
echo ""

