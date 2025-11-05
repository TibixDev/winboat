# WinBoat Podman Setup Guide

Complete guide for running WinBoat with Podman instead of Docker.

---

## 📋 **Table of Contents**

- [Why Podman?](#why-podman)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Installation Methods](#installation-methods)
- [Networking Configuration](#networking-configuration)
- [Troubleshooting](#troubleshooting)
- [Known Limitations](#known-limitations)
- [FAQ](#faq)

---

## 🐳 **Why Podman?**

### **Advantages of Podman**

1. **Rootless by Default** - Runs without root privileges
2. **No Daemon** - Lighter resource usage
3. **Native to Fedora/RHEL** - Comes pre-installed on many distributions
4. **Drop-in Docker Replacement** - Compatible with Docker commands
5. **Perfect for Atomic/Immutable Distros** - Works great on Fedora Atomic, Bazzite, Bluefin

### **Ideal For**

- Fedora, RHEL, CentOS users
- Bazzite, Bluefin, and other atomic desktop users
- Users who prefer rootless containers
- Systems where Docker isn't available or preferred

---

## ✅ **Requirements**

### **System Requirements**

- **CPU**: 2+ cores with virtualization support (Intel VT-x / AMD-V)
- **RAM**: 4GB minimum (8GB+ recommended)
- **Disk**: 50GB+ free space
- **KVM**: `/dev/kvm` must be accessible

### **Software Requirements**

| Package | Purpose | Installation |
|---------|---------|--------------|
| podman | Container runtime | `dnf install podman` (Fedora)<br>`apt install podman` (Ubuntu) |
| podman-compose | Compose support | `dnf install podman-compose` |
| podman-docker | Docker CLI compatibility | `dnf install podman-docker` |
| freerdp | RDP client | `dnf install freerdp` (Fedora)<br>`apt install freerdp3-x11` (Ubuntu) |

### **Supported Distributions**

✅ **Tested & Working:**
- Fedora 39, 40, 41
- Bazzite (all variants)
- Ubuntu 22.04, 24.04 LTS
- Arch Linux (via AUR)

⚠️ **Should Work (Untested):**
- Bluefin
- Aurora
- Other Fedora Atomic derivatives
- Debian 12+

---

## 🚀 **Quick Start**

### **Method 1: 1-Click Installer (Recommended)**

```bash
# Download and run the Podman installer
curl -L -O https://github.com/sprinteroz/winboat/raw/main/INSTALL_WINBOAT_1CLICK_PODMAN.sh
chmod +x INSTALL_WINBOAT_1CLICK_PODMAN.sh
./INSTALL_WINBOAT_1CLICK_PODMAN.sh
```

The installer will:
- ✅ Check system requirements
- ✅ Detect and handle xrdp conflicts (port 3389)
- ✅ Install Podman, podman-compose, podman-docker
- ✅ Configure rootless Podman
- ✅ Install FreeRDP
- ✅ Configure firewall
- ✅ Install WinBoat
- ✅ Create desktop shortcut

### **Method 2: Manual Installation**

See [Manual Installation](#manual-installation) section below.

---

## 📦 **Installation Methods**

### **Automatic Installation (Recommended)**

#### **Fedora/Bazzite:**
```bash
./INSTALL_WINBOAT_1CLICK_PODMAN.sh
```

The script handles everything automatically for Fedora-based systems.

#### **Ubuntu/Debian:**
```bash
./INSTALL_WINBOAT_1CLICK_PODMAN.sh
```

Works on Ubuntu 22.04+ and Debian 12+.

#### **Arch Linux:**
```bash
# Install from AUR
yay -S winboat-git podman podman-compose podman-docker freerdp

# Then run WinBoat
winboat
```

---

### **Manual Installation**

#### **Step 1: Install Podman**

**Fedora/RHEL/CentOS:**
```bash
sudo dnf install -y podman podman-compose podman-docker freerdp
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install -y podman podman-compose podman-docker freerdp3-x11
```

**Arch Linux:**
```bash
sudo pacman -S podman podman-compose podman-docker freerdp
```

#### **Step 2: Configure Rootless Podman**

```bash
# Enable and start Podman socket
systemctl --user enable podman.socket
systemctl --user start podman.socket

# Enable user lingering (allows containers to run when not logged in)
sudo loginctl enable-linger $USER
```

#### **Step 3: Configure Networking**

Create `~/.config/containers/containers.conf`:

```ini
[network]
network_backend = "netavark"

[engine]
compose_providers = ["podman-compose", "/usr/bin/podman-compose"]
```

#### **Step 4: Install WinBoat**

**Fedora (using alien):**
```bash
sudo dnf install -y alien
cd ~/Downloads
curl -L -O $(curl -s https://api.github.com/repos/TibixDev/winboat/releases/latest | grep "browser_download_url.*amd64.deb" | cut -d '"' -f 4)
sudo alien -i winboat*.deb
```

**Ubuntu/Debian:**
```bash
cd ~/Downloads
curl -L -O $(curl -s https://api.github.com/repos/TibixDev/winboat/releases/latest | grep "browser_download_url.*amd64.deb" | cut -d '"' -f 4)
sudo apt install ./winboat*.deb
```

**Arch Linux:**
```bash
yay -S winboat-git
```

#### **Step 5: Launch WinBoat**

```bash
winboat
```

Select **Podman** in the setup wizard!

---

## 🌐 **Networking Configuration**

### **The Networking Challenge**

Podman's rootless networking uses **slirp4netns** which, by default, doesn't allow loopback connections from the container to the host. This prevents the WinBoat guest server (port 7148) from being reachable.

### **Solution: Enable Host Loopback**

After you create your Windows VM in WinBoat, you need to configure the networking:

#### **Method 1: Edit docker-compose.yml (Recommended)**

1. **Stop the container** (if running):
   ```bash
   podman stop WinBoat
   ```

2. **Edit the compose file**:
   ```bash
   nano ~/.winboat/docker-compose.yml
   ```

3. **Add network configuration** under `services.windows`:
   ```yaml
   services:
     windows:
       # ... existing configuration ...
       network_mode: "slirp4netns:port_handler=slirp4netns,enable_ipv6=true,allow_host_loopback=true"
   ```

4. **Restart the container**:
   ```bash
   cd ~/.winboat
   podman-compose up -d
   ```

#### **Method 2: Socat Port Forwarding**

Alternative workaround using socat (from GitHub Issue #12):

```bash
# Install socat in the container
podman exec -ti WinBoat bash -c "apt update && apt -y install socat"

# Configure port forwarding
podman exec WinBoat sed -i -e 's/^return 0$/nohup socat TCP-LISTEN:7148,reuseaddr,fork TCP:20.20.20.21:7148 \&\nnohup socat TCP-LISTEN:3389,reuseaddr,fork TCP:20.20.20.21:3389 \&\nreturn 0/' /run/network.sh

# Restart container
podman restart WinBoat
```

#### **Method 3: Environment Variables**

Add to docker-compose.yml:

```yaml
environment:
  HOST_PORTS: "7149"
  USER_PORTS: "7148"
```

---

## 🔧 **Troubleshooting**

### **Guest Server Unreachable**

**Symptoms:**
- WinBoat UI shows "Guest API Unreachable"
- Cannot launch apps
- Dashboard is empty

**Solution:**
```bash
# Check if container is running
podman ps

# Check guest API
curl http://127.0.0.1:7148/health

# If unreachable, apply networking fix (Method 1 above)
# Edit ~/.winboat/docker-compose.yml and add network_mode line

# Restart
podman restart WinBoat
```

### **RDP Connection Failed**

**Symptoms:**
- "Cannot connect to Windows VM"
- Port 3389 connection refused

**Solution:**
```bash
# Check if port is forwarded
podman port WinBoat

# Check if xrdp is conflicting
sudo systemctl status xrdp

# Stop xrdp if conflicting
sudo systemctl stop xrdp
sudo systemctl disable xrdp

# Restart WinBoat container
podman restart WinBoat
```

### **Podman Permission Denied**

**Symptoms:**
- "Permission denied" when running podman commands
- `/run/user/1000/podman/podman.sock` not accessible

**Solution:**
```bash
# Enable user lingering
sudo loginctl enable-linger $USER

# Start Podman socket
systemctl --user enable podman.socket
systemctl --user start podman.socket

# Verify socket is running
systemctl --user status podman.socket

# Log out and log back in
```

### **Container Won't Start (SELinux)**

**Symptoms (Fedora only):**
- Container fails to start
- SELinux denials in audit log

**Solution:**
```bash
# Check SELinux status
getenforce

# Temporary: Set to permissive
sudo setenforce 0

# Permanent: Configure SELinux policy or disable
# Edit /etc/selinux/config and set SELINUX=permissive

# Restart container
podman restart WinBoat
```

### **Port Already in Use**

**Symptoms:**
- "address already in use" error
- Port 3389 conflict

**Solution:**
```bash
# Check what's using port 3389
sudo ss -tuln | grep 3389
sudo lsof -i :3389

# Common culprit: xrdp
sudo systemctl stop xrdp
sudo systemctl disable xrdp

# Restart WinBoat
podman restart WinBoat
```

### **Podman-Compose Not Found**

**Symptoms:**
- `command not found: podman-compose`

**Solution:**
```bash
# Install via package manager (preferred)
sudo dnf install podman-compose    # Fedora
sudo apt install podman-compose    # Ubuntu

# Or install via pip
pip3 install --user podman-compose

# Verify installation
podman-compose --version
```

---

## ⚠️ **Known Limitations**

### **1. USB Passthrough**

**Status:** ❌ **Limited in rootless Podman**

**Reason:** Rootless containers cannot access `/dev/bus/usb` without special permissions.

**Workarounds:**
- Run Podman as root (not recommended)
- Use udev rules to grant access (complex)
- USB passthrough feature may not work as expected

### **2. Network Performance**

**Status:** ⚠️ **Slightly slower than Docker**

**Reason:** slirp4netns adds network overhead compared to Docker's bridge networking.

**Impact:** Minimal for most use cases, noticeable in network-heavy applications.

### **3. File Sharing**

**Status:** ✅ **Works** (with configuration)

**Note:** Home folder sharing works but may require additional SELinux configuration on Fedora.

### **4. Auto-Start on Boot**

**Status:** ⚠️ **Requires Configuration**

**Setup:**
```bash
# Create systemd user service
mkdir -p ~/.config/systemd/user

# Create service file
cat > ~/.config/systemd/user/winboat.service << 'EOF'
[Unit]
Description=WinBoat Windows Container
After=network.target

[Service]
Type=forking
WorkingDirectory=%h/.winboat
ExecStart=/usr/bin/podman-compose up -d
ExecStop=/usr/bin/podman-compose down
Restart=on-failure

[Install]
WantedBy=default.target
EOF

# Enable and start
systemctl --user enable winboat.service
systemctl --user start winboat.service
```

---

## ❓ **FAQ**

### **Q: Can I use Podman and Docker at the same time?**
A: Yes, with `podman-docker` package, Podman responds to `docker` commands. They can coexist.

### **Q: Will my existing Docker WinBoat setup work with Podman?**
A: Not directly. You'll need to recreate your Windows VM using Podman as the runtime. The VM image files can be migrated.

### **Q: Does Podman work on Bazzite?**
A: **Yes!** Bazzite comes with Podman pre-installed. It's the recommended runtime for atomic desktops.

### **Q: Do I need to run `sudo` with Podman?**
A: **No!** Podman runs rootless by default. Never run as root unless absolutely necessary.

### **Q: Can I switch from Docker to Podman?**
A: Yes, but you'll need to recreate your Windows installation. Export important data first.

### **Q: What about Flatpak WinBoat?**
A: Flatpak support is planned (Issue #11). It will use Podman internally on atomic distributions.

### **Q: Performance compared to Docker?**
A: Very similar. Slight networking overhead with slirp4netns, but negligible for most users.

### **Q: Why isn't guest API reachable?**
A: Apply the networking configuration fix (see [Networking Configuration](#networking-configuration) section).

---

## 📚 **Additional Resources**

### **Official Documentation**
- [Podman Official Docs](https://docs.podman.io/)
- [WinBoat GitHub](https://github.com/TibixDev/winboat)
- [WinBoat Podman Issue #12](https://github.com/TibixDev/winboat/issues/12)

### **Community Solutions**
- [@proatgram's networking fix](https://github.com/TibixDev/winboat/issues/12#issuecomment-3372528242)
- [@jthadden's socat workaround](https://github.com/TibixDev/winboat/issues/12#issuecomment-3396461237)
- [@kroese's environment variables](https://github.com/TibixDev/winboat/issues/12#issuecomment-3437609426)

### **Atomic Desktop Resources**
- [Bazzite Project](https://bazzite.gg/)
- [Universal Blue](https://universal-blue.org/)
- [Fedora Atomic Desktops](https://fedoraproject.org/atomic-desktops/)

---

## 🤝 **Contributing**

Found a better solution? Have a Podman-specific tip? Contributions welcome!

1. Test your solution
2. Document it clearly
3. Submit a PR or open an issue
4. Help other Podman users!

---

## 📝 **Changelog**

### **v1.0 - November 2025**
- Initial Podman support documentation
- 1-click installer created
- Networking configuration guide
- Troubleshooting section
- FAQ section

---

**Made with ❤️ by the WinBoat community**

**Special thanks to:**
- [@TibixDev](https://github.com/TibixDev) - WinBoat creator
- Community contributors in Issue #12
- Bazzite and Atomic Desktop communities

---

**Questions?** Open an issue: https://github.com/TibixDev/winboat/issues
