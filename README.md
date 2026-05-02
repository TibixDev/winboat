<div align="left">
  <table>
    <tr>
      <td>
        <img src="icons/winboat_logo.svg" alt="WinBoat Logo" width="150">
      </td>
      <td>
        <h1 style="color: #7C86FF; margin: 0; font-size: 32px;">WinBoat</h1>
        <p style="color: oklch(90% 0 0); font-size: 14px; margin: 5px 0;">Windows for Penguins.<br>
        Run Windows apps on 🐧 Linux with ✨ seamless integration</p>
      </td>
    </tr>
  </table>
</div>

## Screenshots

<div align="center">
  <img src="gh-assets/features/feat_dash.png" alt="WinBoat Dashboard" width="45%">
  <img src="gh-assets/features/feat_apps.png" alt="WinBoat Apps" width="45%">
  <img src="gh-assets/features/feat_native.png" alt="Native Windows" width="45%">
</div>

## ⚠️ Work in Progress ⚠️

WinBoat is currently in beta, so expect to occasionally run into hiccups and bugs. You should be comfortable with some level of troubleshooting if you decide to try it, however we encourage you to give it a shot anyway.

## Features

- **🎨 Elegant Interface**: Sleek and intuitive interface that seamlessly integrates Windows into your Linux desktop environment, making it feel like a native experience
- **📦 Automated Installs**: Simple installation process through our interface - pick your preferences & specs and let us handle the rest
- **🚀 Run Any App**: If it runs on Windows, it can run on WinBoat. Enjoy the full range of Windows applications as native OS-level windows in your Linux environment
- **🖥️ Full Windows Desktop**: Access the complete Windows desktop experience when you need it, or run individual apps seamlessly integrated into your Linux workflow
- **📁 Filesystem Integration**: Your home directory is mounted in Windows, allowing easy file sharing between the two systems without any hassle
- **✨ And many more**: Smartcard passthrough, resource monitoring, and more features being added regularly

## How Does It Work?

WinBoat is an Electron app which allows you to run Windows apps on Linux using a containerized approach. Windows runs as a VM inside a Docker/Podman container, we communicate with it using the [WinBoat Guest Server](https://github.com/TibixDev/winboat/tree/main/guest_server) to retrieve data we need from Windows. For compositing applications as native OS-level windows, we use FreeRDP together with Windows's RemoteApp protocol.

## Prerequisites

Before running WinBoat, ensure your system meets the following requirements:

- **RAM**: At least 4 GB of RAM
- **CPU**: At least 2 CPU threads
- **Storage**: At least 32 GB free space on the drive your selected install folder corresponds to
- **Virtualization**: KVM enabled in BIOS/UEFI
    - [How to enable virtualization](https://duckduckgo.com/?t=h_&q=how+to+enable+virtualization+in+%3Cmotherboard+brand%3E+bios&ia=web)
- **In case of Docker:**
  - **Docker**: Required for containerization
      - [Installation Guide](https://docs.docker.com/engine/install/)
      - **⚠️ NOTE:** Docker Desktop is **not** supported, you will run into issues if you use it
  - **Docker Compose v2**: Required for compatibility with docker-compose.yml files
      - [Installation Guide](https://docs.docker.com/compose/install/#plugin-linux-only)
  - **Docker User Group**: Add your user to the `docker` group
      - [Setup Instructions](https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user)
- **In case of Podman:**
  - **Podman**: Required for containerization
      - [Installation Guide](https://podman.io/docs/installation#installing-on-linux)
  - **Podman Compose**: Required for compatibility with podman-compose.yml files
      - [Installation Guide](https://github.com/containers/podman-compose?tab=readme-ov-file#installation)
- **FreeRDP**: Required for remote desktop connection (Please make sure you have **Version 3.x.x** with sound support included)
    - [Installation Guide](https://github.com/FreeRDP/FreeRDP/wiki/PreBuilds)
- [OPTIONAL] **Kernel Modules**: The `iptables` / `nftables` and `iptable_nat` kernel modules can be loaded for network autodiscovery and better shared filesystem performance, but this is not obligatory in newer versions of WinBoat
    - [Module loading instructions](https://rentry.org/rmfq2e5e)

## Downloading

You can download the latest Linux builds from **[Releases](https://github.com/TibixDev/winboat/releases)** (created when you push a **`v*`** tag or run **Actions → Build WinBoat → Run workflow** with **Build type: all**) and from **every push to `main`** via **Actions → latest run → Artifacts** (AppImage, `.flatpak`, etc.).

We currently offer these variants:

- **AppImage:** A popular & portable app format which should run fine on most distributions
- **Flatpak (`winboat.flatpak`):** After each successful **`build`** workflow on `main`, download the artifact named like `winboat-*-x86_64.flatpak`, extract it if zipped (GitHub zips single-file artifacts), then run `flatpak install --bundle ./winboat.flatpak`. The same file is attached to **Releases** when a release is produced. Uses Flatpak app ID `app.winboat.WinBoat` (for stores like Flathub); your Electron/desktop integration ID remains `com.teabox.winboat`. When you bump `package.json` **version**, update `<release version="…"/>` in [`flatpak/app.winboat.WinBoat.metainfo.xml`](flatpak/app.winboat.WinBoat.metainfo.xml) for accurate store metadata.
- **Unpacked:** The raw unpacked files, simply run the executable (`linux-unpacked/winboat`)
- **.deb:** The intended format for Debian based distributions
- **.rpm:** The intended format for Fedora based distributions
- **Nix (Nixpkgs)**
    1. Add the winboat package to your config (ensure using nixpkgs-unstable)
    using `environment.systemPackages = [pkgs.winboat];` or `home.packages = [pkgs.winboat];` if using home manager.
    2. Add the following lines to your nix configuration
    ```nix
    virtualisation.docker.enable = true;
    users.users.{yourUser}.extraGroups = ["docker"];
    ```

### Flatpak details

WinBoat drives **Docker or Podman on the host** and uses **KVM** (`/dev/kvm`) for the Windows VM inside [dockur/windows](https://github.com/dockur/windows). The Flatpak is wired for that: host home directory access, container sockets (`/run/docker.sock`, XDG Podman paths), DRI, Pulse/PipeWire audio, and talking to the host Flatpak session so `flatpak run com.freerdp.FreeRDP` can satisfy FreeRDP 3.

The Flatpak wrapper runs Electron with **`--no-sandbox`** / **`--disable-setuid-sandbox`**: Chromium’s setuid `chrome-sandbox` cannot be root-owned inside a Flatpak, so process isolation for the UI relies on **Flatpak’s sandbox** instead (same pattern as many other Electron Flatpaks).

**Flathub:** Publishing on [Flathub](https://flathub.org/) is a separate submission ([author docs](https://docs.flathub.org/docs/for-app-authors/submission)). Reviewers treat apps that depend heavily on host services case-by-case; upstream maintenance expectation applies especially where emulation or host tooling is involved. The canonical manifest for packaging lives at [`flatpak/app.winboat.WinBoat.yml`](flatpak/app.winboat.WinBoat.yml).

**Optional GitHub Pages repo:** The workflow [flatpak-pages.yml](.github/workflows/flatpak-pages.yml) builds an OSTree repo plus `.flatpakrepo`, `.flatpakref`, and a bundle on tags (`v*`) or manual dispatch, and pushes them to the `gh-pages` branch (enable **Pages** in the repo settings first). To mirror Flathub’s builder locally:

```bash
docker run --rm -it -v "$PWD:/work" -w /work ghcr.io/flathub-infra/flatpak-builder:stable \
  flatpak-builder --help
```
## Known Issues About Container Runtimes

- Docker Desktop is **unsupported** for now
- USB passthrough via Podman is currently **unsupported**

## Building WinBoat

- For building you need **Bun**, **Go**, and **Node.js** (see `engines` in `package.json`; Vite’s CLI runs under `node` during production builds)
- Clone the repo (`git clone https://github.com/TibixDev/WinBoat`)
- Install the dependencies (`bun i`)

**Linux outputs:**

| Command | Produces | Notes |
|--------|----------|--------|
| `bun run build:linux-dir` | `dist/linux-unpacked/` only | No AppImage/deb/rpm; **no `rpmbuild`** needed — use this before Flatpak locally. |
| `bun run build:linux-gs` | AppImage, deb, **rpm**, tar.bz2, unpacked | On Debian/Ubuntu install **`rpm`** so electron-builder can call `rpmbuild`: `sudo apt install rpm`. |

CI installs **`rpm`** alongside **`flatpak`** / **`flatpak-builder`** so release jobs match your `electron-builder.json` targets.

### Building the Flatpak bundle locally

You need **`flatpak`** and **`flatpak-builder`** (e.g. `sudo apt install flatpak flatpak-builder`). The first run downloads the Freedesktop SDK/runtime from Flathub and can take a while.

The source build expects **`Node.js` on your `PATH`** so Vite runs under Node; Bun runs scripts and installs deps. If you see `Cannot find module 'vite/module-runner'`, run `rm -rf node_modules && bun install` so **Vite stays at 7.3.1** (pinned in `package.json` + `overrides`).

**Recommended one-shot** (unpack dir target + bundle — avoids RPM tooling):

```bash
bun run build:linux-flatpak
flatpak install --bundle ./dist/winboat.flatpak
```

If you already built unpacked output (`build:linux-dir` or `build:linux-gs`):

```bash
bun run build:flatpak
```

Gitignored Flatpak working dirs: `flatpak/.flatpak-build-dir`, `flatpak/.flatpak-repo-local`, `flatpak/.flatpak-builder-state`, and repo-root **`.flatpak-builder`** (cache flatpak-builder sometimes writes next to the project). **`electron-builder` excludes `flatpak/` and `.flatpak-builder/`** so it does not traverse sandbox or cache trees (`EACCES` under paths like `wpa_supplicant`). If problems persist, delete those directories — avoid `chmod -R` on them.

### Bun install and Docker

- **Host install:** `curl -fsSL https://bun.sh/install | bash` then restart your shell (or `source ~/.bashrc`).
- **`oven/bun`** images ship Bun only — they do **not** include Flatpak, `rpmbuild`, or your distro libraries. Use them only for steps like `bun ci` / `bun run build:linux-dir` **inside** a volume-mounted repo; run **`flatpak/build-bundle.sh`** on the host (or use a **full OS container** below).

**Full Linux build in Docker (example):** Debian/Ubuntu base + deps + Bun + Node + Go + Flatpak tooling + `rpm` for parity with CI:

```bash
docker run --rm -it \
  -v "$(pwd):/src" -w /src \
  ubuntu:22.04 bash -lc '
    apt-get update && apt-get install -y curl ca-certificates git unzip \
      libudev-dev libusb-1.0-0-dev flatpak flatpak-builder rpm golang-go nodejs npm &&
    curl -fsSL https://bun.sh/install | bash &&
    export PATH="$HOME/.bun/bin:$PATH" &&
    bun ci && bun run build:linux-flatpak
  '
```

Use a **newer Node** than the default `nodejs` package if your distro’s version is below `engines.node` (e.g. install from [nodejs.org](https://nodejs.org/) inside the image).

## Running WinBoat in development mode

- Make sure you meet the [prerequisites](#prerequisites)
- Additionally, for development you need to have Bun and Go installed on your system
- Clone the repo (`git clone https://github.com/TibixDev/WinBoat`)
- Install the dependencies (`bun i`)
- Build the guest server (`bun run build:gs`)
- Run the app (`bun run dev`)

## Contributing

Contributions are welcome! Whether it's bug fixes, feature improvements, or documentation updates, we appreciate your help making WinBoat better.

**Please note**: We maintain a focus on technical contributions only. Pull requests containing political/sexual content, or other sensitive/controversial topics will not be accepted. Let's keep things focused on making great software! 🚀

Feel free to:

- Report bugs and issues
- Submit feature requests
- Contribute code improvements
- Help with documentation
- Share feedback and suggestions

Check out our issues page to get started, or feel free to open a new issue if you've found something that needs attention.

## License

WinBoat is licensed under the [MIT](https://github.com/TibixDev/winboat/blob/main/LICENSE) license

## Inspiration / Alternatives

These past few years some cool projects have surfaced with similar concepts, some of which we've also taken inspirations from.\
They're awesome and you should check them out:

- [WinApps](https://github.com/winapps-org/winapps)
- [Cassowary](https://github.com/casualsnek/cassowary)
- [dockur/windows](https://github.com/dockur/windows) (🌟 Also used in WinBoat)

## Socials & Contact

- [![Website](https://img.shields.io/badge/Website-winboat.app-blue?style=flat&logo=googlechrome&logoColor=white)](https://www.winboat.app/)
- [![Twitter](https://img.shields.io/badge/Twitter-@winboat__app-1DA1F2?style=flat&logo=x&logoColor=white)](https://x.com/winboat_app)
- [![Mastodon](https://img.shields.io/badge/Mastodon-@winboat-6364FF?style=flat&logo=mastodon&logoColor=white)](https://fosstodon.org/@winboat)
- [![Bluesky](https://img.shields.io/badge/Bluesky-winboat.app-00A8E8?style=flat&logo=bluesky&logoColor=white)](http://bsky.app/profile/winboat.app)
- [![Discord](https://img.shields.io/badge/Discord-Join_Community-5865F2?style=flat&logo=discord&logoColor=white)](http://discord.gg/MEwmpWm4tN)
- [![Email](https://img.shields.io/badge/Email-staff@winboat.app-D14836?style=flat&logo=gmail&logoColor=white)](mailto:staff@winboat.app)
- [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/TibixDev/winboat)

## Star History

<a href="https://www.star-history.com/#tibixdev/winboat&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=tibixdev/winboat&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=tibixdev/winboat&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=tibixdev/winboat&type=Date" />
 </picture>
</a>
