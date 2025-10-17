{
  stdenv,
  lib,
  fetchurl,
  makeWrapper,
  electron,
  autoPatchelfHook,
  wrapGAppsHook3,
  makeDesktopItem,
  usbutils,
  copyDesktopItems,
  asar,
  libusb1,
}:
stdenv.mkDerivation (final: {
  pname = "winboat";
  version = "0.8.7";

  src = fetchurl {
    url = "https://github.com/TibixDev/winboat/releases/download/v${final.version}/winboat-${final.version}-x64.tar.gz";
    sha256 = "sha256-4NV9nyFLYJt9tz3ikDTb1oSpJGAKr1I49D0VHqpty3I=";
  };

  desktopItems = [
    (makeDesktopItem {
      name = "winboat";
      desktopName = "WinBoat";
      type = "Application";
      exec = "winboat %U";
      terminal = false;
      icon = "winboat";
      categories = ["Utility"];
    })
  ];

  nativeBuildInputs = [
    makeWrapper
    wrapGAppsHook3
    copyDesktopItems
    autoPatchelfHook
    asar
  ];

  buildInputs = [libusb1 usbutils];

  dontBuild = true;
  dontWrapGApps = true;
  autoPatchelfIgnoreMissingDeps = ["libc.musl-x86_64.so.1"];

  installPhase = ''
    runHook preInstall

    mkdir -p $out/bin $out/share/winboat
    cp -r ./* $out/share/winboat
    rm $out/share/winboat/{*.so*,winboat,chrome_crashpad_handler,chrome-sandbox}

    mkdir -p $out/share/icons/hicolor/256x256/apps
    cp ${../icons/icon.png} $out/share/icons/hicolor/256x256/apps/winboat.png

    mkdir -p $out/share/winboat/data
    cp resources/data/usb.ids $out/share/winboat/data/usb.ids

    mkdir -p $out/lib
    cp -r resources/guest_server $out/lib/guest_server
    cp -r resources/guest_server $out/share/winboat/guest_server

    # Rebuild the ASAR archive to patchelf native module.
    tmp=$(mktemp -d)
    asar extract $out/share/winboat/resources/app.asar $tmp
    rm $out/share/winboat/resources/app.asar
    autoPatchelf $tmp
    asar pack $tmp/ $out/share/winboat/resources/app.asar
    rm -rf $tmp

    makeWrapper ${electron}/bin/electron $out/bin/winboat \
      --add-flag "$out/share/winboat/resources/app.asar" \
      --suffix PATH : "${usbutils}/bin" \
      ''${gappsWrapperArgs[@]}

    runHook postInstall
  '';

  meta = {
    mainProgram = "winboat";
    description = "Run Windows apps on Linux with seamless integration";
    license = lib.licenses.mit;
    platforms = ["x86_64-linux"];
  };
})
