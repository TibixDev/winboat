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
}: let
  packageJson = builtins.fromJSON (builtins.readFile ../package.json);
  inherit (packageJson) version;

  iconFile = ../icons/icon.png;

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
in
  stdenv.mkDerivation {
    inherit desktopItems version;
    pname = "winboat";

    src = fetchurl {
      url = "https://github.com/TibixDev/winboat/releases/download/v${version}/winboat-${version}-x64.tar.gz";
      sha256 = "sha256-4NV9nyFLYJt9tz3ikDTb1oSpJGAKr1I49D0VHqpty3I=";
    };

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
      cp ${iconFile} $out/share/icons/hicolor/256x256/apps/winboat.png

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
      description = "WinBoat";
      license = lib.licenses.mit;
      platforms = ["x86_64-linux"];
    };
  }
