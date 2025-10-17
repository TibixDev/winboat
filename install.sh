#!/usr/bin/env bash
# ==================================================
# 🚀 WinBoat Source Installer v1.8
# Description: Builds and installs WinBoat from source.
# Supported OS:
#   Ubuntu, Debian, Pop!_OS, Kubuntu, Lubuntu, Ubuntu Budgie,
#   Linux Mint, Zorin OS, Elementary OS, Edubuntu, Peppermint,
#   Kali, Parrot, Deepin, MX Linux, Raspberry Pi OS,
#   Fedora, Nobara, Bazzite, Qubes, Rocky, CentOS Stream, AlmaLinux,
#   openSUSE, Arch, Manjaro, Garuda, EndeavourOS, ArcoLinux, Artix, CachyOS,
#   Gentoo, NixOS, Solus, Alpine, Void, Slackware, Clear Linux,
#   Linux From Scratch (LFS), Beyond LFS (BLFS), Hardened LFS (HLFS)
# Author: TibixDev (community installer version)
# License: MIT
# ==================================================
set -e

# --- Colors ---
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
BLUE="\033[1;34m"
NC="\033[0m"

REPO_URL="https://github.com/TibixDev/WinBoat.git"
REPO_DIR="WinBoat"
INSTALLER_VERSION="v1.8"

# --- Root check ---
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}⚠️  Do NOT run this script as root.${NC}"
    exit 1
fi

# --- Detect distro ---
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        case "$ID" in
            ubuntu|debian|mint|pop|popos|kubuntu|lubuntu|ubuntu-budgie|budgie|zorin|elementary|edubuntu|peppermint|kali|parrot|deepin|mx|raspbian|raspberrypi)
                echo "debian" ;;
            fedora|nobara|bazzite|qubes|rocky|centos|alma)
                echo "fedora" ;;
            opensuse*|suse|geckolinux)
                echo "opensuse" ;;
            arch|manjaro|garuda|endeavouros|arcolinux|artix|cachyos)
                echo "arch" ;;
            gentoo|funtoo|calculate)
                echo "gentoo" ;;
            nixos)
                echo "nixos" ;;
            alpine)
                echo "alpine" ;;
            void)
                echo "void" ;;
            slackware)
                echo "slackware" ;;
            solus)
                echo "solus" ;;
            clear)
                echo "clear" ;;
            *)
                echo "unknown" ;;
        esac
    else
        echo "unknown"
    fi
}

DISTRO=$(detect_distro)
echo -e "${YELLOW}🧠 Detected distro:${NC} $DISTRO"

# --- Detect LFS variants ---
detect_lfs_variants() {
    if [ -f /etc/LFS ] || [ "$ID" = "lfs" ]; then
        echo "LFS"
    elif [ -f /etc/BLFS ] || [ "$ID" = "blfs" ]; then
        echo "BLFS"
    elif [ -f /etc/HLFS ] || [ "$ID" = "hlfs" ]; then
        echo "HLFS"
    else
        echo ""
    fi
}

LFS_DETECTED=$(detect_lfs_variants)

if [ -n "$LFS_DETECTED" ]; then
    echo -e "${YELLOW}⚠️ Detected $LFS_DETECTED system.${NC}"
    echo "   Automatic dependency installation is NOT supported."
    echo "   Please manually install the following packages:"
    echo "     git, curl or wget, nodejs, npm, go"
    echo
    echo "   After installing dependencies, run the installer again."
    exit 1
fi

# --- Package installer function ---
REBOOT_REQUIRED=false
install_pkg() {
    local pkg=$1
    if ! command -v "$pkg" &>/dev/null; then
        echo -e "${YELLOW}📦 Installing ${pkg}...${NC}"
        case "$DISTRO" in
            debian)
                sudo apt update -y && sudo apt install -y "$pkg" ;;
            fedora)
                if command -v rpm-ostree &>/dev/null; then
                    sudo rpm-ostree install "$pkg" || true
                    REBOOT_REQUIRED=true
                else
                    sudo dnf install -y "$pkg"
                fi ;;
            opensuse)
                sudo zypper install -y "$pkg" ;;
            arch)
                sudo pacman -Sy --noconfirm "$pkg" ;;
            gentoo)
                sudo emerge --noreplace --quiet "$pkg" ;;
            alpine)
                sudo apk add "$pkg" ;;
            void)
                sudo xbps-install -Sy "$pkg" ;;
            slackware)
                sudo slackpkg install "$pkg" ;;
            solus)
                sudo eopkg install -y "$pkg" ;;
            clear)
                sudo swupd bundle-add "$pkg" ;;
            nixos)
                echo -e "${YELLOW}⚠️ Please install '${pkg}' manually using nix-shell.${NC}" ;;
            *)
                echo -e "${RED}⚠️ Unsupported distro for auto-install.${NC}" ;;
        esac
    else
        echo -e "${GREEN}✅ Found ${pkg}${NC}"
    fi
}

# --- Check core dependencies ---
echo -e "${BLUE}🔍 Checking and installing dependencies...${NC}"
for dep in git curl wget; do
    install_pkg "$dep"
done

# --- Node.js ---
if ! command -v node &>/dev/null; then
    case "$DISTRO" in
        debian)
            curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
            sudo apt install -y nodejs ;;
        fedora)
            sudo dnf module install -y nodejs:20 ;;
        opensuse)
            sudo zypper install -y nodejs ;;
        arch)
            sudo pacman -Sy --noconfirm nodejs npm ;;
        gentoo)
            sudo emerge --noreplace --quiet nodejs npm ;;
        alpine)
            sudo apk add nodejs npm ;;
        void)
            sudo xbps-install -Sy nodejs npm ;;
        slackware)
            sudo slackpkg install nodejs npm ;;
        solus)
            sudo eopkg install -y nodejs npm ;;
        clear)
            sudo swupd bundle-add node-basic ;;
        nixos)
            echo -e "${YELLOW}⚠️ Please use nix-shell -p nodejs${NC}" ;;
        *)
            echo -e "${RED}⚠️ Unsupported distro for Node.js auto-install.${NC}" ;;
    esac
fi

# --- Go ---
if ! command -v go &>/dev/null; then
    case "$DISTRO" in
        debian) sudo apt install -y golang ;;
        fedora) sudo dnf install -y golang ;;
        opensuse) sudo zypper install -y golang ;;
        arch) sudo pacman -Sy --noconfirm go ;;
        gentoo) sudo emerge --noreplace --quiet go ;;
        alpine) sudo apk add go ;;
        void) sudo xbps-install -Sy go ;;
        slackware) sudo slackpkg install go ;;
        solus) sudo eopkg install -y golang ;;
        clear) sudo swupd bundle-add go-basic ;;
        nixos) echo -e "${YELLOW}⚠️ Please use nix-shell -p go${NC}" ;;
        *) echo -e "${RED}⚠️ Unsupported distro for Go auto-install.${NC}" ;;
    esac
fi

# --- Clone repository ---
echo -e "${BLUE}📦 Cloning WinBoat repository...${NC}"
if [ -d "$REPO_DIR" ]; then
    cd "$REPO_DIR"
    git pull
else
    git clone "$REPO_URL"
    cd "$REPO_DIR"
fi

# --- Install Node dependencies ---
echo -e "${BLUE}📥 Installing Node dependencies...${NC}"
npm install

# --- Build project ---
echo -e "${BLUE}⚙️  Building WinBoat (Linux Guest Server)...${NC}"
npm run build:linux-gs

echo -e "${GREEN}✅ Build completed successfully!${NC}"
echo "📂 Output directory: dist/"

# --- Reboot prompt for rpm-ostree ---
if [ "$REBOOT_REQUIRED" = true ]; then
    read -rp "Some packages were layered via rpm-ostree. Reboot now? (y/N): " ans
    [[ $ans =~ ^[Yy]$ ]] && sudo systemctl reboot
fi
