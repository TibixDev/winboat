#!/bin/bash
# Quick script to create FreeDOS base image for DOSBoat
# This is a helper script - you still need to manually install FreeDOS in the QEMU window

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMP_DISK="/tmp/freedos-install.qcow2"
BASE_IMAGE="$PROJECT_ROOT/images/FD14-base.qcow2"
ISO_PATH="$PROJECT_ROOT/images/FD14-LiveCD/FD14LIVE.iso"

echo "DOSBoat FreeDOS Base Image Creator"
echo "===================================="
echo ""

# Check if ISO exists
if [ ! -f "$ISO_PATH" ]; then
    echo "ERROR: FreeDOS LiveCD ISO not found at $ISO_PATH"
    echo "Please download FreeDOS 1.4 LiveCD and place it there."
    exit 1
fi

# Check if base image already exists
if [ -f "$BASE_IMAGE" ]; then
    echo "WARNING: Base image already exists at $BASE_IMAGE"
    read -p "Do you want to recreate it? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
    rm "$BASE_IMAGE"
fi

# Check for qemu-img
if ! command -v qemu-img &> /dev/null; then
    echo "ERROR: qemu-img not found. Please install QEMU."
    exit 1
fi

# Check for qemu-system-i386
if ! command -v qemu-system-i386 &> /dev/null; then
    echo "ERROR: qemu-system-i386 not found. Please install QEMU system emulation."
    exit 1
fi

echo "Step 1: Creating blank 1GB QCOW2 disk..."
qemu-img create -f qcow2 "$TEMP_DISK" 1G

echo ""
echo "Step 2: Launching QEMU for FreeDOS installation..."
echo ""
echo "INSTRUCTIONS:"
echo "  1. Choose 'Install to harddisk'"
echo "  2. Select your language"
echo "  3. When prompted about Drive C not being partitioned, answer 'Yes' to partition"
echo "  4. System will reboot automatically"
echo "  5. After reboot, choose 'Yes' to format the drive"
echo "  6. Select installation options (full installation recommended)"
echo "  7. Wait for installation to complete"
echo "  8. After installation, type: fdapm /poweroff"
echo "     (or use the shutdown command to power off cleanly)"
echo ""
read -p "Press Enter to launch QEMU..." 

qemu-system-i386 \
    -m 512M \
    -hda "$TEMP_DISK" \
    -cdrom "$ISO_PATH" \
    -boot d \
    -enable-kvm

echo ""
echo "Step 3: Copying installed image to base location..."
mkdir -p "$(dirname "$BASE_IMAGE")"
cp "$TEMP_DISK" "$BASE_IMAGE"

echo ""
echo "Step 4: Cleaning up temporary disk..."
rm "$TEMP_DISK"

echo ""
echo "Step 5: Verifying base image..."
qemu-img info "$BASE_IMAGE"

echo ""
echo "✓ SUCCESS!"
echo ""
echo "Base image created at: $BASE_IMAGE"
echo "You can now build and run DOSBoat."
echo ""
echo "Next steps:"
echo ""
echo "  For development:"
echo "    bun run dev"
echo ""
echo "  For production build:"
echo "    bun install"
echo "    bun run build"
