{
  description = "WinBoat - Run Windows apps on Linux with seamless integration";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        #package.json
        packageJson = builtins.fromJSON (builtins.readFile ./package.json);
        
        # Node.js dependencies for building
        nodejs = pkgs.nodejs_20;
        
        # Build the Electron app
        winboat-electron = pkgs.stdenv.mkDerivation rec {
          pname = packageJson.name;
          version = packageJson.version;
          
          src = ./.;
          
          nativeBuildInputs = with pkgs; [
            nodejs
            electron
            makeWrapper
            go
          ];
          
          buildPhase = ''
            export HOME=$TMPDIR
            export ELECTRON_SKIP_BINARY_DOWNLOAD=1
            
            # Copy source to build directory
            cp -r . $TMPDIR/build
            cd $TMPDIR/build
            
            # Install npm dependencies
            npm ci --legacy-peer-deps
            
            # Build guest server
            bash build-guest-server.sh
            
            # Build the application
            npm run build:linux-gs
          '';
          
          installPhase = ''
            mkdir -p $out/bin $out/share/applications $out/share/icons
            
            # Install the built AppImage or unpacked app
            if [ -f dist/*.AppImage ]; then
              cp dist/*.AppImage $out/bin/winboat.AppImage
              chmod +x $out/bin/winboat.AppImage
              
              makeWrapper $out/bin/winboat.AppImage $out/bin/winboat \
                --prefix PATH : ${pkgs.freerdp3}/bin
            else
              # If no AppImage, install the unpacked electron app
              cp -r dist/linux-unpacked $out/lib/winboat
              
              makeWrapper ${pkgs.electron}/bin/electron $out/bin/winboat \
                --add-flags "$out/lib/winboat/resources/app" \
                --prefix PATH : ${pkgs.freerdp3}/bin
            fi
            
            # Install desktop entry
            cat > $out/share/applications/winboat.desktop << EOF
            [Desktop Entry]
            Type=Application
            Name=WinBoat
            Comment=Run Windows apps on Linux with seamless integration
            Exec=winboat %U
            Icon=winboat
            Terminal=false
            Categories=System;Emulator;
            EOF
            
            # Install icon
            cp icons/icon.png $out/share/icons/winboat.png
          '';
        };
        
        # AppImage version (downloads pre-built release)
        winboat-appimage = pkgs.appimageTools.wrapType2 {
          pname = "winboat";
          version = "0.7.2";
          
          src = pkgs.fetchurl {
            url = "https://github.com/TibixDev/winboat/releases/download/v0.7.2/winboat-0.7.2.AppImage";
            sha256 = "sha256-XxUrwxw/Thv+amiv2/hGW5K12JgPtNiPdCg+7e+o788=";
          };
          
          extraPkgs = pkgs: with pkgs; [
            freerdp3
          ];
          
          extraInstallCommands = let
            appimageContents = pkgs.appimageTools.extract {
              pname = "winboat";
              version = "0.7.2";
              src = pkgs.fetchurl {
                url = "https://github.com/TibixDev/winboat/releases/download/v0.7.2/winboat-0.7.2.AppImage";
                sha256 = "sha256-XxUrwxw/Thv+amiv2/hGW5K12JgPtNiPdCg+7e+o788=";
              };
            };
          in ''
            # Install desktop entry
            mkdir -p $out/share/applications
            cat > $out/share/applications/winboat.desktop << EOF
            [Desktop Entry]
            Type=Application
            Name=WinBoat
            Comment=Run Windows apps on Linux with seamless integration
            Exec=winboat %U
            Icon=winboat
            Terminal=false
            Categories=System;Emulator;
            EOF
            
            # Install icons from the extracted AppImage
            for size in 16 32 48 64 128 256 512; do
              mkdir -p $out/share/icons/hicolor/''${size}x''${size}/apps
              if [ -f ${appimageContents}/usr/share/icons/hicolor/''${size}x''${size}/apps/winboat.png ]; then
                cp ${appimageContents}/usr/share/icons/hicolor/''${size}x''${size}/apps/winboat.png \
                   $out/share/icons/hicolor/''${size}x''${size}/apps/winboat.png
              fi
            done
          '';
        };
        
      in {
        packages = {
          default = winboat-appimage;
          appimage = winboat-appimage;
          electron = winboat-electron;
        };
        
        apps.default = flake-utils.lib.mkApp {
          drv = winboat-appimage;
        };
        
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs
            electron
            go
            docker
            docker-compose
            freerdp3
          ];
          
          shellHook = ''
            echo "WinBoat development environment"
            echo "Available commands:"
            echo "  npm run dev              - Start development server"
            echo "  npm run build:linux-gs   - Build Linux version with guest server"
            echo "  nix build                - Build the AppImage package"
            echo "  nix build .#electron     - Build from source"
          '';
        };
        
        # NixOS module
        nixosModules.default = { config, lib, pkgs, ... }:
          let
            cfg = config.services.winboat;
          in {
            options.services.winboat = {
              enable = lib.mkEnableOption "WinBoat - Windows apps on Linux";
              
              package = lib.mkOption {
                type = lib.types.package;
                default = self.packages.${system}.default;
                description = "WinBoat package to use";
              };
            };
            
            config = lib.mkIf cfg.enable {
              # Ensure required services are enabled
              virtualisation.docker.enable = true;
              virtualisation.libvirtd.enable = true;
              
              # Load required kernel modules
              boot.kernelModules = [ "iptable_nat" ];
              
              # Install WinBoat and dependencies
              environment.systemPackages = with pkgs; [
                cfg.package
                freerdp3
                docker-compose
                iptables
              ];
            };
          };
      }
    );
}