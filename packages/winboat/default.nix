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

    # This is the final, crucial fix.
    # We add the '--no-sandbox' flag to disable Electron's internal security jail.
    makeWrapper "$appdir/winboat" "$out/bin/winboat" \
      --prefix PATH : "${lib.makeBinPath buildInputs}" \
      --prefix LD_LIBRARY_PATH : "${lib.makeLibraryPath [ libGL ]}:$appdir" \
      --add-flags "--no-sandbox"

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
