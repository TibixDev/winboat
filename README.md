# DOSBoat

**Run FreeDOS on Linux with seamless serial port integration**

DOSBoat is an Electron app that allows you to run FreeDOS in a Docker/Podman container on Linux, with the primary feature being **host serial port passthrough** to the FreeDOS VM. This enables you to use DOS applications that require serial port access (RS-232, USB-to-serial adapters, etc.) on modern Linux systems.


*Notice:* This is mostly just a working fork of WinBoat for ham radio operators. Currently, it is very rough but working POC.    I got it working for Kenwood DOS software with one USB-to-serial Prolific PL2303. There is still a lot of WinBoat logic that needs to be removed (like the Window Apps Service) and the rebrand to DOSBoat is not complete.

## Features

- **FreeDOS in a Container**: Run FreeDOS 1.4 in an isolated Docker/Podman environment
- **Serial Port Passthrough**: Pass native serial ports (`/dev/ttyS*`) and USB-to-serial adapters (`/dev/ttyUSB*`, `/dev/ttyACM*`) directly to the FreeDOS VM
- **VNC Access**: Access the FreeDOS desktop through a web-based VNC interface
- **Simple Setup**: Automated installation process with minimal configuration required
- **Resource Efficient**: FreeDOS requires very little RAM (256MB default) and disk space (2GB default)
- **Legacy BIOS Support**: Configured for legacy boot mode as required by FreeDOS

## What is it for?

DOSBoat is perfect for:
- Running legacy DOS applications that require serial port communication
- Testing serial port software in a DOS environment
- Using DOS-based industrial control software
- Interfacing with serial hardware (modems, data acquisition devices, programmable controllers)
- Retro computing and hobbyist projects involving serial communications

This project was born out of the need for Amatuer Radio Operators (Ham Radio) to use legacy software to program radios where the manufacturer never had the programming software updated to run on Windows, much less Win11. Also, the lack of serial ports on modern PCs requires a translation layer to expose USB to serial adapters to DOS.

## Prerequisites

Before running DOSBoat, ensure your system meets the following modist requirements:

- **RAM**: At least 512 MB of RAM (FreeDOS is very lightweight)
- **CPU**: At least 1 CPU thread
- **Storage**: At least 2 GB free space
- **Virtualization**: KVM enabled in BIOS/UEFI
    - [How to enable virtualization](https://duckduckgo.com/?t=h_&q=how+to+enable+virtualization+in+%3Cmotherboard+brand%3E+bios&ia=web)

### Container Runtime (choose one):

**Docker:**
  - **Docker**: Required for containerization
      - [Installation Guide](https://docs.docker.com/engine/install/)
      - **⚠️ NOTE:** Docker Desktop is **not** supported
  - **Docker Compose v2**: Required for compatibility with docker-compose.yml files
      - [Installation Guide](https://docs.docker.com/compose/install/#plugin-linux-only)
  - **Docker User Group**: Add your user to the `docker` group
      - [Setup Instructions](https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user)

**Podman:**
  - **Podman**: Required for containerization
      - [Installation Guide](https://podman.io/docs/installation#installing-on-linux)
  - **Podman Compose**: Required for compatibility with podman-compose.yml files
      - [Installation Guide](https://github.com/containers/podman-compose?tab=readme-ov-file#installation)

## Serial Port Setup

### Native RS-232 Ports
If your system has native serial ports (rare on modern systems), they will appear as `/dev/ttyS0`, `/dev/ttyS1`, etc. DOSBoat will automatically detect ports with active hardware.

### USB-to-Serial Adapters
Most modern systems use USB-to-serial adapters. These appear as:
- `/dev/ttyUSB0`, `/dev/ttyUSB1`, etc. (FTDI, Prolific, CH340 adapters)
- `/dev/ttyACM0`, `/dev/ttyACM1`, etc. (CDC ACM devices)

**Permissions**: Ensure your user has access to serial ports:
```bash
sudo usermod -a -G dialout $USER
# Log out and back in for the group change to take effect
```

DOSBoat handles both USB bus access (for the adapter itself) and device mapping (for the serial port) automatically. Selected ports will be mapped into the container and configured as COM ports inside FreeDOS.

## How It Works

DOSBoat uses a custom FreeDOS container image with an efficient two-layer disk strategy:

1. **Base Image** - A committed 1GB QCOW2 image with FreeDOS pre-installed (created once)
2. **Overlay Image** - Per-installation QCOW2 overlay that uses the base as a backing file
3. **Serial Device Passthrough** - Maps host `/dev/tty*` devices into the container
4. **USB Bus Access** - Mounts `/dev/bus/usb` for USB-to-serial adapter support
5. **QEMU Serial Chardev** - Configures QEMU with `-chardev serial` arguments to expose host ports as COM ports inside FreeDOS
6. **noVNC** - Provides web-based access to the FreeDOS desktop

This overlay approach saves disk space and allows the base image to be shared across installations while protecting it from corruption.


## Building DOSBoat

### Prerequisites

### Installing Bun

DOSBoat uses [Bun](https://bun.sh) as its JavaScript runtime and package manager. If you don't have Bun installed, follow these steps:

**Quick Install (Linux, macOS, WSL):**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Alternative Installation Methods:**

- **Using npm:**
  ```bash
  npm install -g bun
  ```

- **Using Homebrew (macOS/Linux):**
  ```bash
  brew install oven-sh/bun/bun
  ```

- **Manual Installation:**
  Download the appropriate binary from the [Bun releases page](https://github.com/oven-sh/bun/releases)

**Verify Installation:**
```bash
bun --version
```

After installation, you may need to restart your terminal or run:
```bash
source ~/.bashrc  # or ~/.zshrc, depending on your shell
```

### Building the Application

Once Bun is installed:

- Clone the repo: `git clone https://github.com/chevybowtie/dosboat`
- Navigate to the directory: `cd dosboat`
- Install dependencies: `bun i`
- Build the app: `bun run build:linux`
- Find the built app under `dist` with AppImage and unpacked variants

### Linux build dependencies

Building the Electron app compiles native modules (like `usb`) and requires system headers.

**Debian/Ubuntu:**
```bash
sudo apt-get update && sudo apt-get install -y libudev-dev rpm
```

**Fedora/RHEL:**
```bash
sudo dnf install -y systemd-devel rpm-build
```

**Arch/Manjaro:**
```bash
sudo pacman -S --needed systemd rpm-tools
```

**openSUSE:**
```bash
sudo zypper install -y libudev-devel rpm-build
```

If you are on another distro, install the equivalent `libudev` development package via your package manager.

## Running DOSBoat in Development Mode

- Make sure you meet the [prerequisites](#prerequisites)
- For development you need to have Bun installed (see [Installing Bun](#installing-bun))
- Clone the repo: `git clone https://github.com/chevybowtie/dosboat`
- Navigate to the directory: `cd dosboat`
- Install dependencies: `bun i`
- Run the app: `bun run dev`

## Contributing

Contributions are welcome! Whether it's bug fixes, feature improvements, or documentation updates, we appreciate your help making DOSBoat better.

**Please note**: We maintain a focus on technical contributions only. 

Feel free to:
- Report bugs and issues
- Submit feature requests
- Contribute code improvements
- Help with documentation
- Share feedback and suggestions

## License

DOSBoat is licensed under the [MIT](LICENSE) license

## Credits

DOSBoat is a fork of [WinBoat](https://github.com/TibixDev/winboat) by TibixDev, adapted for FreeDOS and serial port passthrough use cases.

### Key Technologies
- [FreeDOS](https://www.freedos.org/) - The DOS operating system
- [QEMU](https://www.qemu.org/) - VM emulation
- [Electron](https://www.electronjs.org/) - Cross-platform desktop framework
- [Vue.js](https://vuejs.org/) - UI framework
- [noVNC](https://novnc.com/) - Browser-based VNC client
