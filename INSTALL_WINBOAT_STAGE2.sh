#!/bin/bash

# ============================================
# WinBoat Stage 2 Installer
# ============================================
# This script runs automatically after reboot
# and performs a clean WinBoat installation
# ============================================
# FOR TESTING: Uses sprinteroz/winboat fork
# FOR PRODUCTION: Change REPO_URL before PR
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
LOG_FILE="$HOME/winboat-stage2-install.log"
LOCK_FILE="$HOME/.winboat-stage2.lock"
INSTALL_DIR="$HOME/winboat-dev"

# ============================================
# REPOSITORY CONFIGURATION
# ============================================
# FOR TESTING: Use sprinteroz fork with FIX branch (all 13 commits)
REPO_URL="https://github.com/sprinteroz/winboat.git"
REPO_BRANCH="fix/port-3389-xrdp-conflict"

# FOR PRODUCTION: Uncomment these lines before submitting PR to main repo
# After testing completes successfully, change to upstream repo
# REPO_URL="https://github.com/TibixDev/winboat.git"
# REPO_BRANCH="main"

echo "Repository configuration:"
echo "  URL: $REPO_URL"
echo "  Branch: $REPO_BRANCH"
echo ""
# ============================================

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

# ===================================================================
# AUTO-RECOVERY: Check for failed previous installation
# ===================================================================

if [ -f "$LOCK_FILE" ]; then
    log_warning "╔══════════════════════════════════════════════════════════════╗"
    log_warning "║  PREVIOUS INSTALLATION DETECTED (Lock file exists)          ║"
    log_warning "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    log_warning "A previous Stage 2 installation attempt was detected."
    log_warning "This usually happens if:"
    log_warning "  • Password prompt was closed or cancelled"
    log_warning "  • Installation was interrupted (Ctrl+C)"
    log_warning "  • System error occurred during installation"
    echo ""
    log_info "Lock file: $LOCK_FILE"
    
    # Check for partial installation
    if [ -d "$INSTALL_DIR" ]; then
        log_warning "Partial installation found at: $INSTALL_DIR"
    fi
    
    echo ""
    log_info "${YELLOW}AUTO-RECOVERY: Cleaning up and retrying installation...${NC}"
    log_info "This will happen automatically in 10 seconds."
    log_info "Press Ctrl+C to cancel if you want to investigate first."
    echo ""
    
    for i in {10..1}; do
        echo -ne "\r  Auto-cleanup in: ${i}s  "
        sleep 1
    done
    echo -e "\r  ${GREEN}✓ Proceeding with cleanup${NC}"
    echo ""
    
    # Clean up lock file
    log_info "Removing lock file..."
    rm -f "$LOCK_FILE"
    log_success "Lock file removed"
    
    # Clean up partial installation
    if [ -d "$INSTALL_DIR" ]; then
        log_info "Removing partial installation..."
        rm -rf "$INSTALL_DIR"
        log_success "Partial installation removed"
    fi
    
    # Clean up old log
    if [ -f "$LOG_FILE" ]; then
        log_info "Archiving old log file..."
        mv "$LOG_FILE" "$LOG_FILE.old"
        log_success "Old log archived to: $LOG_FILE.old"
    fi
    
    # Clean up root-owned .winboat directory (from failed sudo)
    if [ -d "$HOME/.winboat" ]; then
        log_info "Removing leftover configuration..."
        sudo rm -rf "$HOME/.winboat" 2>/dev/null || true
        log_success "Leftover configuration removed"
    fi
    
    echo ""
    log_success "Cleanup complete! Starting fresh installation..."
    echo ""
    sleep 2
fi

# Create lock file
touch "$LOCK_FILE"
log_info "Lock file created (prevents duplicate runs)"

echo ""
log "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
log "${GREEN}║         WINBOAT STAGE 2 INSTALLER (Post-Reboot)             ║${NC}"
log "${GREEN}║    Installing from: sprinteroz/winboat (TESTING VERSION)    ║${NC}"
log "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

log_info "Waiting 30 seconds for desktop environment to stabilize..."
for i in {30..1}; do
    echo -ne "\r  Countdown: ${i}s  "
    sleep 1
done
echo -e "\r  ${GREEN}✓ Ready to begin installation${NC}"
echo ""

# ===================================================================
# STEP 1: SYSTEM UPDATE
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 1/7: Updating System${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

log_info "Updating package lists..."
sudo apt update >> "$LOG_FILE" 2>&1
log_success "Package lists updated"

log_info "Upgrading installed packages..."
sudo apt upgrade -y >> "$LOG_FILE" 2>&1
log_success "System upgraded"

echo ""

# ===================================================================
# STEP 2: INSTALL DEPENDENCIES
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 2/7: Installing Dependencies${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

log_info "Installing build essentials..."
sudo apt install -y build-essential git curl wget ca-certificates >> "$LOG_FILE" 2>&1
log_success "Build tools installed"

# ===================================================================
# STEP 3: INSTALL DOCKER (if not present)
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 3/7: Checking Docker Installation${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    log_success "Docker already installed: $DOCKER_VERSION"
else
    log_info "Docker not found. Installing Docker..."
    
    # Add Docker GPG key
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc >> "$LOG_FILE" 2>&1
    sudo chmod a+r /etc/apt/keyrings/docker.asc
    
    # Add Docker repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker
    sudo apt update >> "$LOG_FILE" 2>&1
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >> "$LOG_FILE" 2>&1
    
    # Start Docker
    sudo systemctl start docker
    sudo systemctl enable docker >> "$LOG_FILE" 2>&1
    
    # Add user to docker group
    sudo usermod -aG docker "$USER"
    
    log_success "Docker installed successfully"
    log_warning "Docker group membership is now active (post-reboot)"
fi

echo ""

# ===================================================================
# STEP 4: INSTALL NODE.JS
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 4/7: Installing Node.js${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

# Check current Node.js installation
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1 | sed 's/v//')
    NODE_LOCATION=$(which node)
    
    log_info "Found Node.js $NODE_VERSION at: $NODE_LOCATION"
    
    if [ "$NODE_MAJOR" -ge 23 ]; then
        log_success "Node.js version is sufficient: $NODE_VERSION"
    else
        log_warning "Node.js $NODE_VERSION is too old (WinBoat requires v23+)"
        
        # Check if it's apt-installed (in /usr/bin)
        if [[ "$NODE_LOCATION" == "/usr/bin/node" ]] || [[ "$NODE_LOCATION" == "/usr/local/bin/node" ]]; then
            log_info "Removing system-installed Node.js..."
            sudo apt remove -y nodejs npm 2>&1 | tee -a "$LOG_FILE"
            sudo apt autoremove -y 2>&1 | tee -a "$LOG_FILE"
            log_success "Old Node.js removed"
        fi
        
        log_info "Will install Node.js v23 via nvm"
    fi
else
    log_info "Node.js not found. Will install via nvm..."
fi

# Install nvm if not present
if [ ! -d "$HOME/.nvm" ]; then
    log_info "Installing nvm (Node Version Manager)..."
    log_info "This may take 1-2 minutes depending on your connection..."
    
    # Download nvm with timeout
    if ! curl --connect-timeout 30 --max-time 120 -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash >> "$LOG_FILE" 2>&1; then
        log_error "Failed to install nvm"
        log_error "Check your internet connection and try again"
        exit 1
    fi
    
    log_success "nvm installed"
else
    log_success "nvm already installed"
fi

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Verify nvm loaded
if ! command -v nvm &> /dev/null; then
    log_error "nvm failed to load"
    log_error "Try running: source ~/.nvm/nvm.sh"
    exit 1
fi

log_info "nvm version: $(nvm --version)"

# Check if Node.js 23 is already installed via nvm
if nvm ls 23 &> /dev/null; then
    log_success "Node.js v23 already installed via nvm"
    nvm use 23 >> "$LOG_FILE" 2>&1
else
    log_info "Installing Node.js v23 via nvm..."
    log_info "This will download ~20MB and may take 2-5 minutes..."
    echo ""
    
    # Install Node.js 23 with progress (not to log file so user sees progress)
    if ! nvm install 23; then
        log_error "Failed to install Node.js v23"
        log_error "This might be a network issue. Check your connection."
        log_info "You can try manually: nvm install 23"
        exit 1
    fi
    
    log_success "Node.js v23 downloaded and installed"
fi

# Set Node.js 23 as default
log_info "Setting Node.js v23 as default..."
nvm use 23 >> "$LOG_FILE" 2>&1
nvm alias default 23 >> "$LOG_FILE" 2>&1

# Verify Node.js is working
if ! command -v node &> /dev/null; then
    log_error "Node.js installation failed - 'node' command not found"
    exit 1
fi

FINAL_NODE_VERSION=$(node --version)
FINAL_NPM_VERSION=$(npm --version)

log_success "Node.js ready: $FINAL_NODE_VERSION"
log_success "npm ready: $FINAL_NPM_VERSION"

echo ""

# ===================================================================
# STEP 5: INSTALL FREERDP
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 5/7: Installing FreeRDP${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

if command -v xfreerdp3 &> /dev/null; then
    log_success "FreeRDP3 already installed"
elif command -v xfreerdp &> /dev/null; then
    log_success "FreeRDP2 already installed"
else
    log_info "Installing FreeRDP..."
    if sudo apt install -y freerdp3-x11 >> "$LOG_FILE" 2>&1; then
        log_success "FreeRDP3 installed"
    elif sudo apt install -y freerdp2-x11 >> "$LOG_FILE" 2>&1; then
        log_success "FreeRDP2 installed"
    else
        log_error "Failed to install FreeRDP"
        exit 1
    fi
fi

echo ""

# ===================================================================
# STEP 6: CLONE & INSTALL WINBOAT
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 6/7: Cloning & Installing WinBoat${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

# Remove old installation if exists
if [ -d "$INSTALL_DIR" ]; then
    log_info "Removing old installation directory..."
    rm -rf "$INSTALL_DIR"
fi

log_info "Cloning WinBoat from: $REPO_URL"
log_info "Branch: $REPO_BRANCH"
git clone -b "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR" >> "$LOG_FILE" 2>&1
log_success "WinBoat cloned to: $INSTALL_DIR"

log_info "Installing npm dependencies..."
cd "$INSTALL_DIR"
npm install >> "$LOG_FILE" 2>&1
log_success "Dependencies installed ($(ls node_modules | wc -l) packages)"

# Fix Electron sandbox permissions (required for development)
log_info "Configuring Electron sandbox permissions..."
if [ -f "$INSTALL_DIR/node_modules/electron/dist/chrome-sandbox" ]; then
    sudo chown root:root "$INSTALL_DIR/node_modules/electron/dist/chrome-sandbox"
    sudo chmod 4755 "$INSTALL_DIR/node_modules/electron/dist/chrome-sandbox"
    log_success "Electron sandbox configured"
else
    log_warning "Electron sandbox not found - may need manual configuration"
fi

# Increase file watcher limit for development
log_info "Configuring system for development..."
echo "fs.inotify.max_user_watches=524288" | sudo tee -a /etc/sysctl.conf >> "$LOG_FILE" 2>&1
sudo sysctl -p >> "$LOG_FILE" 2>&1
log_success "File watcher limit increased"

echo ""

# ===================================================================
# STEP 7: CREATE LAUNCH SCRIPT
# ===================================================================

log "${BLUE}════════════════════════════════════════════════════════${NC}"
log "${BLUE}  STEP 7/7: Creating Launch Script${NC}"
log "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

# Create convenient launch script
cat > "$HOME/start-winboat-dev.sh" << 'EOFSCRIPT'
#!/bin/bash

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Navigate to WinBoat directory
cd "$HOME/winboat-dev" || exit 1

# Start WinBoat in development mode
npm run dev
EOFSCRIPT

chmod +x "$HOME/start-winboat-dev.sh"
log_success "Launch script created: ~/start-winboat-dev.sh"

# Create desktop shortcut
mkdir -p "$HOME/Desktop"
cat > "$HOME/Desktop/WinBoat-Dev.desktop" << EOFDESKTOP
[Desktop Entry]
Version=1.0
Type=Application
Name=WinBoat (Dev)
Comment=Run WinBoat in Development Mode
Exec=bash -c 'cd ~/winboat-dev && source ~/.nvm/nvm.sh && npm run dev'
Icon=$HOME/winboat-dev/icons/winboat_logo.svg
Terminal=true
Categories=Development;Utility;
EOFDESKTOP

chmod +x "$HOME/Desktop/WinBoat-Dev.desktop"
log_success "Desktop shortcut created"

echo ""

# ===================================================================
# REMOVE SYSTEMD SERVICE
# ===================================================================

log_info "Removing Stage 2 autostart service..."
systemctl --user stop winboat-stage2-install.service 2>/dev/null || true
systemctl --user disable winboat-stage2-install.service 2>/dev/null || true
rm -f "$HOME/.config/systemd/user/winboat-stage2-install.service"
systemctl --user daemon-reload 2>/dev/null || true
log_success "Autostart service removed"

echo ""

# ===================================================================
# INSTALLATION COMPLETE
# ===================================================================

log "${GREEN}════════════════════════════════════════════════════════${NC}"
log "${GREEN}  Stage 2 Installation Complete!${NC}"
log "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""

log_success "WinBoat has been installed successfully!"
echo ""

log "${YELLOW}╔══════════════════════════════════════════════════════════════╗${NC}"
log "${YELLOW}║                    IMPORTANT INFORMATION                      ║${NC}"
log "${YELLOW}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

log "${YELLOW}Installation Details:${NC}"
log "  • Installation directory: ${GREEN}$INSTALL_DIR${NC}"
log "  • Repository: ${GREEN}$REPO_URL${NC}"
log "  • Branch: ${GREEN}$REPO_BRANCH${NC}"
log "  • Log file: ${GREEN}$LOG_FILE${NC}"
echo ""

log "${YELLOW}Launch WinBoat:${NC}"
log "  Option 1: Double-click the ${GREEN}WinBoat-Dev${NC} icon on your desktop"
log "  Option 2: Run: ${GREEN}~/start-winboat-dev.sh${NC}"
log "  Option 3: Run: ${GREEN}cd ~/winboat-dev && npm run dev${NC}"
echo ""

log "${YELLOW}Build WinBoat for Production:${NC}"
log "  ${GREEN}cd ~/winboat-dev && npm run build${NC}"
echo ""

log "${YELLOW}Port Conflict Reminder:${NC}"
log "  • Ensure xrdp is not running: ${GREEN}sudo systemctl status xrdp${NC}"
log "  • If needed, stop xrdp: ${GREEN}sudo systemctl stop xrdp${NC}"
echo ""

log "${YELLOW}Troubleshooting:${NC}"
log "  • Check logs: ${GREEN}cat $LOG_FILE${NC}"
log "  • Port status: ${GREEN}sudo ss -tuln | grep 3389${NC}"
log "  • Docker status: ${GREEN}docker ps${NC}"
echo ""

log "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
log "${GREEN}║  Ready to launch WinBoat! All fixes are now active!         ║${NC}"
log "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Auto-launch WinBoat
log_info "Launching WinBoat in 5 seconds..."
log_info "Press Ctrl+C to cancel and launch manually later"
sleep 5

log_info "Starting WinBoat..."
cd "$INSTALL_DIR"
npm run dev
