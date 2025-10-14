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
        ubuntu|lubuntu|kubuntu|ubuntu-budgie|xubuntu|pop|kde-neon)
            DISTRO="ubuntu"
            ;;
        fedora|nobara)
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

# Download AppImage
echo "Downloading WinBoat from: $WINBOAT_URL"
curl -L -o "$HOME/bin/WinBoat.AppImage" "$WINBOAT_URL"
chmod +x "$HOME/bin/WinBoat.AppImage"

# Create symlink in /usr/local/bin
if [ -w /usr/local/bin ]; then
    sudo ln -sf "$HOME/bin/WinBoat.AppImage" /usr/local/bin/winboat
    echo "Symlink created: /usr/local/bin/winboat"
else
    echo "Cannot write to /usr/local/bin. You may need to run:"
    echo "sudo ln -sf \"$HOME/bin/WinBoat.AppImage\" /usr/local/bin/winboat"
fi

# Detect shell and give PATH instructions
USER_SHELL=$(basename "$SHELL")
echo ""
echo "=== Post-install instructions ==="
case "$USER_SHELL" in
    bash)
        echo "Add ~/bin to your PATH if not already:"
        echo 'echo "export PATH=\"$HOME/bin:\$PATH\"" >> ~/.bashrc && source ~/.bashrc'
        ;;
    zsh)
        echo "Add ~/bin to your PATH if not already:"
        echo 'echo "export PATH=\"$HOME/bin:\$PATH\"" >> ~/.zshrc && source ~/.zshrc'
        ;;
    fish)
        echo "Add ~/bin to your PATH if not already:"
        echo 'set -Ux fish_user_paths $HOME/bin $fish_user_paths'
        ;;
    *)
        echo "Your shell ($USER_SHELL) is not automatically handled."
        echo "Ensure ~/bin is in your PATH to run WinBoat.AppImage"
        ;;
esac

echo ""
echo "You can now run WinBoat with: winboat"
echo "=== Installation complete! ==="
