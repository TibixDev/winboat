#!/bin/bash

# WinBoat 1-Click Installer
# Complete installation script with automatic port conflict resolution
# Author: Community contribution for port conflict fix
# Version: 1.0

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Log file
LOG_FILE="$HOME/winboat-install.log"

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
log "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
log "${GREEN}║       WINBOAT 1-CLICK INSTALLER WITH PORT FIX                ║${NC}"
log "${GREEN}║   Complete installation with automatic conflict resolution   ║${NC}"
log "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
log "Installation log: $LOG_FILE"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    log_error "Please do not run this script as root or with sudo"
    log_error "The script will prompt for sudo password when needed"
    exit 1
fi

# Verify Ubuntu/Debian
if [ ! -f /etc/os-release ]; then
    log_error "Cannot determine OS. This script is for Ubuntu/Debian only."
    exit 1
fi

source /etc/os-release
if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
    log_warning "This script is designed for Ubuntu/Debian"
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

log_info "Detected: $NAME $VERSION"
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
# STEP 3: REMOVE OLD DOCKER PACKAGES
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 3/9: Removing Old Docker Packages${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

log_info "Removing conflicting Docker packages..."
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
    if dpkg -l | grep -q "^ii.*$pkg"; then
        log_info "Removing $pkg..."
        sudo apt-get remove -y "$pkg" >> "$LOG_FILE" 2>&1 || true
    fi
done
log_success "Old packages removed"
echo ""

# ===================================================================
# STEP 4: INSTALL OFFICIAL DOCKER
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 4/9: Installing Official Docker${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

log_info "Installing Docker prerequisites..."
sudo apt-get update >> "$LOG_FILE" 2>&1
sudo apt-get install -y ca-certificates curl >> "$LOG_FILE" 2>&1
log_success "Prerequisites installed"

log_info "Adding Docker GPG key..."
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc >> "$LOG_FILE" 2>&1
sudo chmod a+r /etc/apt/keyrings/docker.asc
log_success "GPG key added"

log_info "Adding Docker repository..."
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
log_success "Repository added"

log_info "Installing Docker Engine..."
sudo apt-get update >> "$LOG_FILE" 2>&1
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >> "$LOG_FILE" 2>&1
log_success "Docker Engine installed"

log_info "Starting Docker service..."
sudo systemctl start docker
sudo systemctl enable docker.service >> "$LOG_FILE" 2>&1
sudo systemctl enable containerd.service >> "$LOG_FILE" 2>&1
log_success "Docker service started and enabled"

log_info "Adding $USER to docker group..."
sudo groupadd docker 2>/dev/null || true
sudo usermod -aG docker "$USER"
log_success "User added to docker group"
log_warning "Docker group membership requires logout/login to take effect"

echo ""

# ===================================================================
# STEP 5: INSTALL FREERDP
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 5/9: Installing FreeRDP${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

log_info "Installing FreeRDP 3.x (required for RDP connection)..."
sudo apt-get update >> "$LOG_FILE" 2>&1

if sudo apt-get install -y freerdp3-x11 >> "$LOG_FILE" 2>&1; then
    log_success "FreeRDP 3.x installed"
else
    log_warning "FreeRDP 3.x not available, trying FreeRDP 2.x..."
    if sudo apt-get install -y freerdp2-x11 >> "$LOG_FILE" 2>&1; then
        log_success "FreeRDP 2.x installed"
    else
        log_error "Failed to install FreeRDP"
        log_error "WinBoat requires FreeRDP for Remote Desktop connection"
        exit 1
    fi
fi

echo ""

# ===================================================================
# STEP 6: CONFIGURE FIREWALL
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 6/9: Configuring Firewall${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

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
    
    log_success "Firewall configured for WinBoat"
else
    log_warning "UFW not installed - skipping firewall configuration"
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
sudo apt install -y ./winboat.deb >> "$LOG_FILE" 2>&1
log_success "WinBoat installed"

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
Comment=Run Windows Apps on Linux
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

log_success "WinBoat has been successfully installed!"
echo ""

log "${YELLOW}╔══════════════════════════════════════════════════════════════╗${NC}"
log "${YELLOW}║                    IMPORTANT NEXT STEPS                      ║${NC}"
log "${YELLOW}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

log "${YELLOW}1. RESTART YOUR COMPUTER${NC}"
log "   Docker group membership requires a full system restart"
echo ""

if [ "$XRDP_WAS_RUNNING" = true ]; then
    log "${YELLOW}2. PORT CONFLICT INFORMATION${NC}"
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

log "${YELLOW}3. AFTER RESTART${NC}"
log "   • Double-click the WinBoat icon on your desktop"
log "   • Or run: ${GREEN}winboat${NC}"
log "   • Follow the setup wizard to install Windows"
echo ""

log "${YELLOW}4. TROUBLESHOOTING${NC}"
log "   • Installation log: ${GREEN}${LOG_FILE}${NC}"
log "   • Check port status: ${GREEN}sudo ss -tuln | grep 3389${NC}"
log "   • Check xrdp status: ${GREEN}sudo systemctl status xrdp${NC}"
log "   • Docker logs: ${GREEN}docker logs WinBoat${NC}"
echo ""

log "${YELLOW}5. GETTING HELP${NC}"
log "   • WinBoat GitHub: https://github.com/TibixDev/winboat"
log "   • Report issues: https://github.com/TibixDev/winboat/issues"
echo ""

log "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
log "${GREEN}║  Installation completed successfully!                        ║${NC}"
log "${GREEN}║  Press Enter to restart now, or Ctrl+C to restart later     ║${NC}"
log "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

read -p "Press Enter to RESTART NOW..."
sudo reboot
