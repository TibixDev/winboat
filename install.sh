#!/usr/bin/env bash
# ==================================================
# 🚀 WinBoat Source Installer v1.0
# Description: Builds and installs WinBoat from source.
# Supported OS:
#   Ubuntu, Debian, Pop!_OS, Kubuntu, Lubuntu, Ubuntu Budgie,
#   Linux Mint, Zorin OS, Elementary OS, Fedora, openSUSE
# Author: TibixDev (community installer version)
# License: MIT
# ==================================================
set -e

# --- Colors ---
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
BLUE="\033[1;34m"
NC="\033[0m" # No color

REPO_URL="https://github.com/TibixDev/WinBoat.git"
REPO_DIR="WinBoat"
INSTALLER_VERSION="v1.3"

# --- Help option ---
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    echo -e "${BLUE}WinBoat Source Installer ${INSTALLER_VERSION}${NC}"
    echo
    echo "Usage:"
    echo "  bash install.sh [options]"
    echo
    echo "Options:"
    echo "  --help, -h    Show this help message and exit"
    echo
    echo "Description:"
    echo "  Automatically installs dependencies (NodeJS, Go, Git)"
    echo "  and builds WinBoat from source on supported Linux distributions."
    echo
    echo "Example:"
    echo "  curl -fsSL https://raw.githubusercontent.com/TibixDev/WinBoat/main/install.sh | bash"
    echo
    exit 0
fi

# --- Root check ---
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}⚠️  Please do NOT run this script as root.${NC}"
    echo "    It will request sudo privileges when needed."
    exit 1
fi

# --- Banner ---
echo -e "${BLUE}🚀 WinBoat Source Installer ${INSTALLER_VERSION}${NC}"
echo "=========================================="
echo

# --- Detect Distro ---
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "$ID"
    else
        echo "unknown"
    fi
}
DISTRO=$(detect_distro)
echo -e "${YELLOW}🧠 Detected distro:${NC} $DISTRO"

# --- Package installer function ---
install_pkg() {
    local pkg=$1
    if ! command -v "$pkg" &>/dev/null; then
        echo -e "${YELLOW}📦 Installing ${pkg}...${NC}"
        case "$DISTRO" in
            ubuntu|debian|pop|popos|kubuntu|lubuntu|ubuntu-budgie|budgie|mint|zorin|elementary)
                sudo apt update -y && sudo apt install -y "$pkg"
                ;;
            fedora)
                sudo dnf install -y "$pkg"
                ;;
            opensuse*|suse)
                sudo zypper install -y "$pkg"
                ;;
            *)
                echo -e "${RED}⚠️ Unsupported distro for auto-install: ${DISTRO}${NC}"
                echo "   Please install '${pkg}' manually."
                ;;
        esac
    else
        echo -e "${GREEN}✅ Found ${pkg}${NC}"
    fi
}

echo
echo -e "${BLUE}🔍 Checking and installing dependencies...${NC}"

for dep in git curl wget; do
    install_pkg "$dep"
done

# --- Node.js + npm ---
if ! command -v node &>/dev/null; then
    echo -e "${YELLOW}📦 Installing Node.js (LTS)...${NC}"
    case "$DISTRO" in
        ubuntu|debian|pop|popos|kubuntu|lubuntu|ubuntu-budgie|budgie|mint|zorin|elementary)
            curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
            sudo apt install -y nodejs
            ;;
        fedora)
            sudo dnf module install -y nodejs:20
            ;;
        opensuse*|suse)
            sudo zypper install -y nodejs
            ;;
        *)
            echo -e "${RED}⚠️ Unsupported distro for Node.js auto-install.${NC}"
            ;;
    esac
else
    echo -e "${GREEN}✅ Found Node.js${NC}"
fi

# --- Go ---
if ! command -v go &>/dev/null; then
    echo -e "${YELLOW}📦 Installing Go...${NC}"
    case "$DISTRO" in
        ubuntu|debian|pop|popos|kubuntu|lubuntu|ubuntu-budgie|budgie|mint|zorin|elementary)
            sudo apt install -y golang
            ;;
        fedora)
            sudo dnf install -y golang
            ;;
        opensuse*|suse)
            sudo zypper install -y golang
            ;;
        *)
            echo -e "${RED}⚠️ Unsupported distro for Go auto-install.${NC}"
            ;;
    esac
else
    echo -e "${GREEN}✅ Found Go${NC}"
fi

# --- Git ---
install_pkg git

# --- Clone or update repo ---
echo
echo -e "${BLUE}📦 Cloning WinBoat repository...${NC}"
if [ -d "$REPO_DIR" ]; then
    echo -e "${YELLOW}➡️  Directory '$REPO_DIR' already exists. Updating...${NC}"
    cd "$REPO_DIR"
    git pull
else
    git clone "$REPO_URL"
    cd "$REPO_DIR"
fi

# --- Install dependencies ---
echo
echo -e "${BLUE}📥 Installing Node dependencies...${NC}"
npm install

# --- Build project ---
echo
echo -e "${BLUE}⚙️  Building WinBoat (Linux Guest Server)...${NC}"
npm run build:linux-gs

echo
echo -e "${GREEN}✅ Build completed successfully!${NC}"
echo "📂 Output directory: dist/"
echo "   - AppImage: dist/*.AppImage"
echo "   - Unpacked: dist/unpacked/"
echo
echo -e "${BLUE}🎉 Installation complete. Enjoy WinBoat!${NC}"
