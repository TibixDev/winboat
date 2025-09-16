{
  lib,
  stdenv,
  fetchurl,
  makeWrapper,
  unzip,
  patchelf,
  # WinBoat's runtime dependencies
  freerdp,
  libvirt,
  wimlib,
  adwaita-icon-theme,
  netcat,
  iproute2,
  dialog,
  docker-compose,
  # Electron's runtime dependencies
  alsa-lib,
  at-spi2-atk,
  cups,
  dbus,
  expat,
  gtk3,
  libuuid,
  libxshmfence,
  nss,
  libdrm,
  mesa,
  libxkbcommon,
  glib,
  nspr,
  pango,
  cairo,
  libX11,
  libXcomposite,
  libXdamage,
  libXext,
  libXfixes,
  libXrandr,
  libgbm,
  libxcb,
  systemd,
  libGL
}:

let
  icon = fetchurl {
    url = "https://raw.githubusercontent.com/TibixDev/winboat/main/icons/icon.png";
    hash = "sha256-P3M/EdfMgcUcZUkBRYrdZCl4vl5cbx/dEvRaOuIrnc0=";
  };
in
stdenv.mkDerivation rec {
  pname = "winboat";
  version = "0.7.12";

  src = fetchurl {
    url = "https://github.com/TibixDev/winboat/releases/download/v${version}/winboat-linux-unpacked.zip";
    hash = "sha256-kaXWZ7QyRfajqAVWCyEcWHA2pViNpa/RLKHf52Hkx5s=";
  };

  nativeBuildInputs = [ makeWrapper unzip patchelf ];

  buildInputs = [
    freerdp libvirt wimlib adwaita-icon-theme netcat iproute2 dialog
    docker-compose
    alsa-lib at-spi2-atk cups dbus expat gtk3 libuuid libxshmfence
    nss libdrm mesa libxkbcommon glib nspr pango cairo libX11
    libXcomposite libXdamage libXext libXfixes libXrandr libgbm libxcb
    systemd libGL
  ];

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    local appdir="$out/lib/winboat"
    mkdir -p "$appdir"
    cp -r ./* "$appdir/"

    patchelf \
      --set-interpreter "$(cat $NIX_CC/nix-support/dynamic-linker)" \
      --set-rpath "${lib.makeLibraryPath buildInputs}" \
      "$appdir/winboat"

    makeWrapper "$appdir/winboat" "$out/bin/winboat" \
      --prefix PATH : "${lib.makeBinPath buildInputs}" \
      --prefix LD_LIBRARY_PATH : "${lib.makeLibraryPath [ libGL ]}:$appdir" \
      --add-flags "--no-sandbox"

    # --- Desktop Integration ---

    install -Dm644 ${icon} $out/share/icons/hicolor/256x256/apps/winboat.png

    install -Dm644 /dev/null $out/share/applications/winboat.desktop
    cat > $out/share/applications/winboat.desktop <<EOF
    [Desktop Entry]
    Name=WinBoat
    Comment=Run Windows applications on Linux like they are native
    Exec=$out/bin/winboat
    Icon=winboat
    Type=Application
    Terminal=false
    Categories=System;Emulator;
    EOF

    runHook postInstall
  '';

  meta = with lib; {
    description = "Run Windows applications on Linux like they are native";
    homepage = "https://github.com/TibixDev/winboat";
    license = licenses.mit;
    mainProgram = "winboat";
    platforms = platforms.linux;
  };
}
