pkgname=winboat
pkgver=0.8.7
pkgrel=1
pkgdesc="Run Windows apps on 🐧 Linux with ✨ seamless integration"
arch=('x86_64')
url="https://github.com/TibixDev/WinBoat"
license=('MIT')
depends=(
  'docker'
  'docker-compose'
  'freerdp>=3.0.0'
  'libx11'
  'libxkbfile'
  'gtk3'
  'nss'
  'libsecret'
)
makedepends=(
  'git'
  'npm'
  'go'
)
optdepends=(
  'iptables: network autodiscovery support'
  'nftables: alternative networking support'
)
provides=('winboat')
conflicts=('winboat-bin' 'winboat-appimage')
source=("git+https://github.com/TibixDev/WinBoat.git")
sha256sums=('SKIP')

pkgver() {
  cd "$srcdir/WinBoat"
  git describe --tags --abbrev=0 | sed 's/^v//;s/-/./g'
}

prepare() {
  cd "$srcdir/WinBoat"
  echo "==> Installing Node.js dependencies (reproducible)..."
  npm ci
}

build() {
  cd "$srcdir/WinBoat"
  echo "==> Building WinBoat guest server and Electron app..."
  npm run build:linux-gs
}

package() {
  cd "$srcdir/WinBoat"

  # Main files
  install -dm755 "$pkgdir/opt/$pkgname"
  cp -r dist/linux-unpacked/* "$pkgdir/opt/$pkgname"

  # Wrapper
  install -Dm755 /dev/stdin "$pkgdir/usr/bin/winboat" <<EOF
#!/bin/sh
exec /opt/$pkgname/winboat "\$@"
EOF

  # Desktop entry
  install -Dm644 resources/icon.png "$pkgdir/usr/share/pixmaps/winboat.png"
  install -Dm644 /dev/stdin "$pkgdir/usr/share/applications/winboat.desktop" <<EOF
[Desktop Entry]
Name=WinBoat
Exec=winboat
Icon=winboat
Type=Application
Categories=System;Utility;
Comment=Run Windows apps on Linux using a containerized Windows VM
EOF

  # License
  install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
}

post_install() {
  echo "================================================================="
  echo " ⚙️  WinBoat Post-Install Notice"
  echo "-----------------------------------------------------------------"
  echo " • Ensure virtualization (KVM) is enabled in your BIOS/UEFI."
  echo " • Add your user to the docker group if not already:"
  echo "     sudo usermod -aG docker \$USER"
  echo "   Then log out and back in for the change to take effect."
  echo " • Docker Desktop and Podman are NOT supported."
  echo " • FreeRDP 3.x with sound support is required."
  echo ""
  echo "You can launch WinBoat via your applications menu or by running:"
  echo "     winboat"
  echo "================================================================="
}
