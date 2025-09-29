{
  description = "WinBoat - Run Windows apps on Linux with seamless integration";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      pkgs = import nixpkgs { system = "x86_64-linux"; };
      packageJson = builtins.fromJSON (builtins.readFile ./package.json);
      version = packageJson.version;

      usb_ids = builtins.toFile "usb.ids" (builtins.readFile ./data/usb.ids);
      iconFile = ./icons/icon.png;
      winboatPkg = pkgs.stdenv.mkDerivation {
        pname = "winboat";
        version = version;

        src = pkgs.fetchurl {
          url = "https://github.com/TibixDev/winboat/releases/download/v${version}/winboat-${version}-x64.tar.gz";
          sha256 = "1mvvd6y0wcpqh6wmjzpax7pkdpwcibhb9y7hnrd7x79fr0s5f3mp";
        };
        
        nativeBuildInputs = [
          pkgs.makeWrapper
          pkgs.freerdp3
          pkgs.usbutils
          pkgs.libusb1
        ];
        buildInputs = [ pkgs.electron pkgs.gcc pkgs.glibc pkgs.stdenv.cc.cc.lib ];

        installPhase = ''
          mkdir -p $out/bin $out/share/winboat
          (cd . && tar cf - .) | (cd $out/share/winboat && tar xf -)
          cat > $out/bin/winboat <<EOF
#!/bin/sh
export LD_LIBRARY_PATH=${pkgs.gcc}/lib:${pkgs.glibc}/lib:${pkgs.electron}/lib:${pkgs.stdenv.cc.cc.lib}/lib:$LD_LIBRARY_PATH
exec ${pkgs.electron}/bin/electron $out/share/winboat/resources/app.asar "$@"
EOF
          chmod +x $out/bin/winboat
           
          mkdir -p $out/share/icons/hicolor/256x256/apps
          mkdir -p $out/share/winboat
           
          cp ${iconFile} $out/share/icons/hicolor/256x256/apps/winboat.png
          cp ${iconFile} $out/share/winboat/icon.png
           
          # desktop entry
          mkdir -p $out/share/applications
          cat > $out/share/applications/winboat.desktop <<EOF
[Desktop Entry]
Name=WinBoat
Exec=$out/bin/winboat %U
Type=Application
Terminal=false
Icon=winboat
Categories=Utility;
EOF

          mkdir -p $out/share/winboat/data
          mkdir -p $out/share/winboat/resources/data

          cp ${usb_ids} $out/share/winboat/data/usb.ids
          cp ${usb_ids} $out/share/winboat/resources/data/usb.ids

          mkdir -p $out/lib/guest_server

          if [ -d guest_server ]; then
            cp -a guest_server/. $out/share/winboat/resources/guest_server/
            cp -a guest_server/. $out/share/winboat/guest_server/
            cp -a guest_server/. $out/lib/guest_server/
          elif [ -d resources/guest_server ]; then
            cp -a resources/guest_server/. $out/share/winboat/resources/guest_server/
            cp -a resources/guest_server/. $out/share/winboat/guest_server/
            cp -a resources/guest_server/. $out/lib/guest_server/
          else
            ls -la
            exit 1
          fi
        '';


        meta = with pkgs.lib; { description = "WinBoat"; license = licenses.mit; platforms = [ "x86_64-linux" ]; };
      };

    in {
      packages.x86_64-linux.winboat = winboatPkg;

      winboat = winboatPkg;

      defaultPackage.x86_64-linux = winboatPkg;

      apps.x86_64-linux.winboat = {
        type = "app";
        program = "${winboatPkg}/bin/winboat";
      };
    };
}