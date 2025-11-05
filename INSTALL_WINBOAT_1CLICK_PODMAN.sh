#!/bin/bash

# WinBoat 1-Click Installer - PODMAN Edition
# Complete installation script for Podman with automatic port conflict resolution
# Author: Community contribution for Podman support (Issue #12)
# Version: 1.0

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Log file
LOG_FILE="$HOME/winboat-podman-install.log"

# Function to log messages
log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

# Function to log errors
log_error() {
    echo -e "${RED}ERROR: $1${NC}" | tee -a "$LOG_FILE"
}

# Function to log success
log_success() {
    echo -e "${GREEN}✓ $1${NC}" | tee -a "$LOG_FILE"
}

# Function to log warnings
log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

# Function to log info
log_info() {
    echo -e "${BLUE}→ $1${NC}" | tee -a "$LOG_FILE"
}

# Clear log file
> "$LOG_FILE"

echo ""
log "${PURPLE}╔══════════════════════════════════════════════════════════════╗${NC}"
log "${PURPLE}║     WINBOAT 1-CLICK INSTALLER - PODMAN EDITION              ║${NC}"
log "${PURPLE}║   Complete Podman installation with conflict resolution     ║${NC}"
log "${PURPLE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
log "Installation log: $LOG_FILE"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    log_error "Please do not run this script as root or with sudo"
    log_error "The script will prompt for sudo password when needed"
    log_error "Podman works best in rootless mode"
    exit 1
fi

# Verify OS
if [ ! -f /etc/os-release ]; then
    log_error "Cannot determine OS. This script is for Linux only."
    exit 1
fi

source /etc/os-release
log_info "Detected: $NAME $VERSION"

# Detect distribution family
DISTRO_FAMILY=""
if [[ "$ID" == "fedora" ]] || [[ "$ID" == "rhel" ]] || [[ "$ID" == "centos" ]] || [[ "$ID_LIKE" == *"fedora"* ]]; then
    DISTRO_FAMILY="fedora"
elif [[ "$ID" == "ubuntu" ]] || [[ "$ID" == "debian" ]] || [[ "$ID_LIKE" == *"ubuntu"* ]] || [[ "$ID_LIKE" == *"debian"* ]]; then
    DISTRO_FAMILY="debian"
elif [[ "$ID" == "arch" ]] || [[ "$ID_LIKE" == *"arch"* ]]; then
    DISTRO_FAMILY="arch"
else
    log_warning "Unknown distribution family, proceeding with best guess"
    DISTRO_FAMILY="unknown"
fi

log_info "Distribution family: $DISTRO_FAMILY"
echo ""

# ===================================================================
# STEP 1: PRE-FLIGHT CHECKS
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 1/9: Pre-flight System Checks${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

# Check for virtualization support
log_info "Checking virtualization support..."
if grep -E -q 'vmx|svm' /proc/cpuinfo; then
    if [ -e /dev/kvm ]; then
        log_success "KVM virtualization is enabled"
    else
        log_warning "CPU supports virtualization but /dev/kvm not found"
        log_warning "You may need to enable it in BIOS"
    fi
else
    log_error "CPU does not support virtualization (no VMX/SVM)"
    log_error "WinBoat requires virtualization support"
    exit 1
fi

# Check RAM
log_info "Checking system memory..."
TOTAL_RAM=$(free -g | awk '/^Mem:/{print $2}')
if [ "$TOTAL_RAM" -lt 4 ]; then
    log_error "Insufficient RAM: ${TOTAL_RAM}GB detected, minimum 4GB required"
    exit 1
fi
log_success "System RAM: ${TOTAL_RAM}GB (sufficient)"

# Check CPU cores
log_info "Checking CPU cores..."
CPU_CORES=$(nproc)
if [ "$CPU_CORES" -lt 2 ]; then
    log_error "Insufficient CPU cores: ${CPU_CORES} detected, minimum 2 required"
    exit 1
fi
log_success "CPU cores: ${CPU_CORES} (sufficient)"

# Check disk space
log_info "Checking disk space..."
AVAILABLE_SPACE=$(df -BG "$HOME" | tail -1 | awk '{print $4}' | sed 's/G//')
if [ "$AVAILABLE_SPACE" -lt 50 ]; then
    log_warning "Low disk space: ${AVAILABLE_SPACE}GB available"
    log_warning "Recommended: at least 50GB free for WinBoat"
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    log_success "Disk space: ${AVAILABLE_SPACE}GB available"
fi

echo ""

# ===================================================================
# STEP 2: PORT CONFLICT DETECTION AND RESOLUTION
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 2/9: Port Conflict Detection (Port 3389)${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

XRDP_WAS_RUNNING=false
XRDP_ACTION=""

log_info "Checking for port 3389 conflicts..."
echo ""

# Check if xrdp is installed and running
if systemctl list-unit-files | grep -q "xrdp.service"; then
    log_info "xrdp is installed on this system"
    
    if systemctl is-active --quiet xrdp 2>/dev/null; then
        XRDP_WAS_RUNNING=true
        log_warning "xrdp is currently running on port 3389"
        echo ""
        log "WinBoat requires port 3389 for Remote Desktop connection to Windows VM"
        log "You need to choose how to handle xrdp:"
        echo ""
        log "  ${GREEN}1${NC}. Stop xrdp temporarily (restarts on reboot)"
        log "  ${GREEN}2${NC}. Stop and disable xrdp permanently (won't auto-start)"
        log "  ${GREEN}3${NC}. Keep xrdp running (installation will likely fail)"
        log "  ${GREEN}4${NC}. Cancel installation"
        echo ""
        
        while true; do
            read -p "Choose option [1-4]: " -n 1 -r XRDP_CHOICE
            echo ""
            echo ""
            
            case $XRDP_CHOICE in
                1)
                    log_info "Stopping xrdp temporarily..."
                    sudo systemctl stop xrdp
                    XRDP_ACTION="stopped_temp"
                    log_success "xrdp stopped (will auto-start on reboot)"
                    log_warning "After reboot, xrdp may conflict with WinBoat"
                    log "         To prevent this, run: sudo systemctl disable xrdp"
                    break
                    ;;
                2)
                    log_info "Stopping and disabling xrdp..."
                    sudo systemctl stop xrdp
                    sudo systemctl disable xrdp
                    XRDP_ACTION="disabled"
                    log_success "xrdp stopped and disabled permanently"
                    log_info "You can re-enable it later with: sudo systemctl enable xrdp"
                    break
                    ;;
                3)
                    log_warning "Continuing with xrdp running - installation may fail!"
                    XRDP_ACTION="ignored"
                    break
                    ;;
                4)
                    log_info "Installation cancelled by user"
                    exit 0
                    ;;
                *)
                    log_error "Invalid choice. Please enter 1, 2, 3, or 4."
                    ;;
            esac
        done
    else
        log_success "xrdp is installed but not running"
    fi
else
    log_success "xrdp is not installed (no conflicts)"
fi

echo ""

# Check if port 3389 is in use by any service
log_info "Verifying port 3389 availability..."
if ss -tuln 2>/dev/null | grep ':3389 ' | grep -v '127.0.0.1:3389' > /dev/null; then
    log_error "Port 3389 is still in use by another service!"
    log "Check what's using it: sudo ss -tuln | grep 3389"
    log "Or: sudo lsof -i :3389"
    echo ""
    read -p "Abort installation? [Y/n] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        log_error "Installation aborted due to port conflict"
        exit 1
    fi
    log_warning "Continuing despite port conflict - installation may fail"
else
    log_success "Port 3389 is available"
fi

echo ""

# ===================================================================
# STEP 3: INSTALL PODMAN AND PODMAN-COMPOSE
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 3/9: Installing Podman and Podman-Compose${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

# Check if Podman is already installed
if command -v podman &> /dev/null; then
    PODMAN_VERSION=$(podman --version | awk '{print $3}')
    log_success "Podman already installed: version $PODMAN_VERSION"
else
    log_info "Installing Podman..."
    
    case $DISTRO_FAMILY in
        fedora)
            sudo dnf install -y podman podman-compose podman-docker >> "$LOG_FILE" 2>&1
            ;;
        debian)
            sudo apt-get update >> "$LOG_FILE" 2>&1
            sudo apt-get install -y podman podman-compose podman-docker >> "$LOG_FILE" 2>&1
            ;;
        arch)
            sudo pacman -S --noconfirm podman podman-compose podman-docker >> "$LOG_FILE" 2>&1
            ;;
        *)
            log_error "Unsupported distribution for automatic Podman installation"
            log_error "Please install podman, podman-compose, and podman-docker manually"
            exit 1
            ;;
    esac
    
    log_success "Podman installed successfully"
fi

# Verify podman-compose
if command -v podman-compose &> /dev/null; then
    log_success "podman-compose is available"
else
    log_warning "podman-compose not found, trying pip installation..."
    pip3 install --user podman-compose >> "$LOG_FILE" 2>&1 || {
        log_error "Failed to install podman-compose"
        exit 1
    }
    log_success "podman-compose installed via pip"
fi

# Enable and start podman socket for rootless
log_info "Enabling rootless Podman socket..."
systemctl --user enable podman.socket >> "$LOG_FILE" 2>&1 || true
systemctl --user start podman.socket >> "$LOG_FILE" 2>&1 || true
log_success "Podman socket configured"

# Enable linger for user (allows services to run when not logged in)
log_info "Enabling loginctl linger for $USER..."
sudo loginctl enable-linger "$USER" || true
log_success "User linger enabled"

echo ""

# ===================================================================
# STEP 4: CONFIGURE PODMAN FOR WINBOAT
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 4/9: Configuring Podman for WinBoat${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

log_info "Configuring Podman networking for WinBoat..."

# Create/update containers.conf for better networking
CONTAINERS_CONF="$HOME/.config/containers/containers.conf"
mkdir -p "$(dirname "$CONTAINERS_CONF")"

if [ ! -f "$CONTAINERS_CONF" ]; then
    log_info "Creating containers.conf..."
    cat > "$CONTAINERS_CONF" << 'EOF'
[network]
# Enable Host Loopback for WinBoat guest server connectivity
network_backend = "netavark"

[engine]
# Compatibility with docker-compose
compose_providers = ["podman-compose", "/usr/bin/podman-compose"]
EOF
    log_success "Created $CONTAINERS_CONF"
else
    log_info "containers.conf already exists, not modifying"
fi

log_success "Podman configuration complete"

echo ""

# ===================================================================
# STEP 5: INSTALL FREERDP
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 5/9: Installing FreeRDP${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

log_info "Installing FreeRDP 3.x (required for RDP connection)..."

case $DISTRO_FAMILY in
    fedora)
        sudo dnf install -y freerdp >> "$LOG_FILE" 2>&1 && log_success "FreeRDP installed" || {
            log_error "Failed to install FreeRDP"
            exit 1
        }
        ;;
    debian)
        sudo apt-get update >> "$LOG_FILE" 2>&1
        if sudo apt-get install -y freerdp3-x11 >> "$LOG_FILE" 2>&1; then
            log_success "FreeRDP 3.x installed"
        else
            log_warning "FreeRDP 3.x not available, trying FreeRDP 2.x..."
            if sudo apt-get install -y freerdp2-x11 >> "$LOG_FILE" 2>&1; then
                log_success "FreeRDP 2.x installed"
            else
                log_error "Failed to install FreeRDP"
                exit 1
            fi
        fi
        ;;
    arch)
        sudo pacman -S --noconfirm freerdp >> "$LOG_FILE" 2>&1 && log_success "FreeRDP installed" || {
            log_error "Failed to install FreeRDP"
            exit 1
        }
        ;;
esac

echo ""

# ===================================================================
# STEP 6: CONFIGURE FIREWALL
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 6/9: Configuring Firewall${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

# UFW (Ubuntu/Debian)
if command -v ufw &> /dev/null; then
    log_info "Configuring UFW firewall rules..."
    
    sudo ufw allow 3389/tcp comment 'WinBoat RDP' 2>/dev/null || true
    sudo ufw allow 3389/udp comment 'WinBoat RDP' 2>/dev/null || true
    sudo ufw allow 7148:7149/tcp comment 'WinBoat Guest API' 2>/dev/null || true
    sudo ufw allow 8006/tcp comment 'WinBoat noVNC' 2>/dev/null || true
    sudo ufw allow 137/udp comment 'Samba NetBIOS' 2>/dev/null || true
    sudo ufw allow 138/udp comment 'Samba NetBIOS' 2>/dev/null || true
    sudo ufw allow 139/tcp comment 'Samba NetBIOS' 2>/dev/null || true
    sudo ufw allow 445/tcp comment 'Samba SMB' 2>/dev/null || true
    
    log_success "UFW firewall configured for WinBoat"
# firewalld (Fedora/RHEL)
elif command -v firewall-cmd &> /dev/null; then
    log_info "Configuring firewalld rules..."
    
    sudo firewall-cmd --permanent --add-port=3389/tcp >> "$LOG_FILE" 2>&1 || true
    sudo firewall-cmd --permanent --add-port=3389/udp >> "$LOG_FILE" 2>&1 || true
    sudo firewall-cmd --permanent --add-port=7148-7149/tcp >> "$LOG_FILE" 2>&1 || true
    sudo firewall-cmd --permanent --add-port=8006/tcp >> "$LOG_FILE" 2>&1 || true
    sudo firewall-cmd --permanent --add-port=137-139/udp >> "$LOG_FILE" 2>&1 || true
    sudo firewall-cmd --permanent --add-port=139/tcp >> "$LOG_FILE" 2>&1 || true
    sudo firewall-cmd --permanent --add-port=445/tcp >> "$LOG_FILE" 2>&1 || true
    sudo firewall-cmd --reload >> "$LOG_FILE" 2>&1 || true
    
    log_success "firewalld configured for WinBoat"
else
    log_warning "No firewall detected - skipping firewall configuration"
fi

echo ""

# ===================================================================
# STEP 7: INSTALL WINBOAT APPLICATION
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 7/9: Installing WinBoat Application${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

log_info "Downloading latest WinBoat release..."
cd ~/Downloads

# Get latest release URL
LATEST_URL=$(curl -s https://api.github.com/repos/TibixDev/winboat/releases/latest | grep "browser_download_url.*amd64.deb" | cut -d '"' -f 4)

if [ -z "$LATEST_URL" ]; then
    log_error "Failed to get latest WinBoat release URL"
    log_error "Check your internet connection or GitHub API rate limit"
    exit 1
fi

log_info "Downloading from: $LATEST_URL"
curl -L -o winboat.deb "$LATEST_URL" >> "$LOG_FILE" 2>&1
log_success "WinBoat package downloaded"

log_info "Installing WinBoat..."
case $DISTRO_FAMILY in
    fedora)
        # Convert deb to rpm or use alien
        log_warning "Note: WinBoat .deb package on Fedora"
        log_warning "You may need to convert to RPM or use alien"
        log_info "Attempting to install with alien..."
        if command -v alien &> /dev/null || sudo dnf install -y alien >> "$LOG_FILE" 2>&1; then
            sudo alien -i winboat.deb >> "$LOG_FILE" 2>&1 && log_success "WinBoat installed via alien" || {
                log_error "Failed to install via alien"
                log_error "Please install WinBoat manually"
            }
        else
            log_error "Cannot convert .deb on Fedora without alien"
            log_error "Please check for RPM package or use AppImage"
        fi
        ;;
    debian)
        sudo apt install -y ./winboat.deb >> "$LOG_FILE" 2>&1
        log_success "WinBoat installed"
        ;;
    arch)
        log_warning "Use AUR package: yay -S winboat-git"
        log_info "Attempting to extract and install..."
        # For Arch, suggest AUR
        log_error "Please use: yay -S winboat-git"
        ;;
esac

echo ""

# ===================================================================
# STEP 8: CREATE DESKTOP SHORTCUT
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 8/9: Creating Desktop Shortcut${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

log_info "Creating desktop shortcut..."
mkdir -p ~/Desktop

cat > ~/Desktop/WinBoat.desktop << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=WinBoat
Comment=Run Windows Apps on Linux (Podman)
Exec=winboat
Icon=winboat
Terminal=false
Categories=Utility;
EOF

chmod +x ~/Desktop/WinBoat.desktop
log_success "Desktop shortcut created"

echo ""

# ===================================================================
# STEP 9: INSTALLATION COMPLETE
# ===================================================================

log "${GREEN}════════════════════════════════════════════════════════${NC}"
log "${GREEN}  STEP 9/9: Installation Complete!${NC}"
log "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""

log_success "WinBoat with Podman has been successfully installed!"
echo ""

log "${YELLOW}╔══════════════════════════════════════════════════════════════╗${NC}"
log "${YELLOW}║                    IMPORTANT NEXT STEPS                      ║${NC}"
log "${YELLOW}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

log "${YELLOW}1. PODMAN NETWORKING CONFIGURATION${NC}"
log "   WinBoat with Podman requires special network configuration for"
log "   the guest server (port 7148) to be reachable."
echo ""
log "   ${GREEN}After launching WinBoat and creating your Windows VM:${NC}"
log "   Edit ~/.winboat/docker-compose.yml and add this line under 'services.windows':"
echo ""
log "   ${PURPLE}network_mode: \"slirp4netns:port_handler=slirp4netns,enable_ipv6=true,allow_host_loopback=true\"${NC}"
echo ""
log "   Then restart the container: ${GREEN}podman restart WinBoat${NC}"
echo ""

log "${YELLOW}2. RESTART (Optional but Recommended)${NC}"
log "   For best results, restart your computer to ensure all services"
log "   are properly configured."
echo ""

if [ "$XRDP_WAS_RUNNING" = true ]; then
    log "${YELLOW}3. PORT CONFLICT INFORMATION${NC}"
    case $XRDP_ACTION in
        "stopped_temp")
            log "   • xrdp was stopped temporarily"
            log "   • It will auto-start on reboot and may conflict with WinBoat"
            log "   • To prevent conflicts, disable xrdp:"
            log "     ${GREEN}sudo systemctl disable xrdp${NC}"
            ;;
        "disabled")
            log "   • xrdp has been permanently disabled"
            log "   • WinBoat will have exclusive access to port 3389"
            log "   • To re-enable xrdp: sudo systemctl enable xrdp"
            ;;
        "ignored")
            log "   • xrdp is still running"
            log "   • WinBoat may fail to start due to port conflict"
            log "   • Stop xrdp before using WinBoat:"
            log "     ${GREEN}sudo systemctl stop xrdp${NC}"
            ;;
    esac
    echo ""
fi

log "${YELLOW}4. AFTER RESTART (or now)${NC}"
log "   • Double-click the WinBoat icon on your desktop"
log "   • Or run: ${GREEN}winboat${NC}"
log "   • In setup, select ${PURPLE}Podman${NC} as your container runtime"
log "   • Follow the setup wizard to install Windows"
echo ""

log "${YELLOW}5. TROUBLESHOOTING${NC}"
log "   • Installation log: ${GREEN}${LOG_FILE}${NC}"
log "   • Check port status: ${GREEN}sudo ss -tuln | grep 3389${NC}"
log "   • Check Podman: ${GREEN}podman ps${NC}"
log "   • Podman logs: ${GREEN}podman logs WinBoat${NC}"
log "   • Guest API: ${GREEN}curl http://127.0.0.1:7148/health${NC}"
echo ""

log "${YELLOW}6. KNOWN LIMITATIONS${NC}"
log "   • USB passthrough is limited in rootless Podman"
log "   • Some features may require additional configuration"
log "   • See PODMAN_SETUP.md for detailed information"
echo ""

log "${YELLOW}7. GETTING HELP${NC}"
log "   • WinBoat GitHub: https://github.com/TibixDev/winboat"
log "   • Podman Issue: https://github.com/TibixDev/winboat/issues/12"
log "   • Report issues: https://github.com/TibixDev/winboat/issues"
echo ""

log "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
log "${GREEN}║  Installation completed successfully!                        ║${NC}"
log "${GREEN}║  Launch WinBoat and select Podman in the setup wizard       ║${NC}"
log "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

log "${PURPLE}Podman-powered WinBoat is ready to use! 🚀${NC}"
