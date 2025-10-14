#!/usr/bin/env bash
set -e

echo "=== WinBoat CLI Installer ==="

# Helper function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Detect distro
if [ -f /etc/os-release ]; then
    . /etc/os-release
    case "$ID" in
        ubuntu|lubuntu|kubuntu|ubuntu-budgie|pop)
            DISTRO="ubuntu"
            ;;
        fedora)
            DISTRO="fedora"
            ;;
        arch|manjaro)
            DISTRO="arch"
            ;;
        *)
            echo "Unsupported Linux distribution: $ID"
            exit 1
            ;;
    esac
else
    echo "Cannot detect Linux distribution."
    exit 1
fi

echo "Detected distro: $DISTRO"

# Install dependencies
echo "Installing dependencies..."
if [ "$DISTRO" = "ubuntu" ]; then
    sudo apt update
    sudo apt install -y docker.io qemu-kvm curl wget
elif [ "$DISTRO" = "fedora" ]; then
    sudo dnf install -y docker qemu-kvm curl wget
elif [ "$DISTRO" = "arch" ] || [ "$DISTRO" = "manjaro" ]; then
    sudo pacman -Syu --noconfirm docker qemu curl wget
fi

# Create ~/bin if it doesn't exist
mkdir -p "$HOME/bin"

# Fetch latest release download URL from GitHub
echo "Fetching latest WinBoat release..."
WINBOAT_URL=$(curl -s https://api.github.com/repos/TibixDev/winboat/releases/latest \
    | grep "browser_download_url.*AppImage" \
    | cut -d '"' -f 4)

if [ -z "$WINBOAT_URL" ]; then
    echo "Failed to fetch latest WinBoat AppImage."
    exit 1
fi

echo "Downloading WinBoat from: $WINBOAT_URL"
curl -L -o "$HOME/bin/WinBoat.AppImage" "$WINBOAT_URL"
chmod +x "$HOME/bin/WinBoat.AppImage"

echo "WinBoat installed at: $HOME/bin/WinBoat.AppImage"
echo "Make sure $HOME/bin is in your PATH to run it easily."
echo "You can start it with: WinBoat.AppImage"

echo "=== Installation complete! ==="
