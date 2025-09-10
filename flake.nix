{
  description = "WinBoat - Windows for Penguins";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        packageJson = builtins.fromJSON (builtins.readFile ./package.json);
        version = packageJson.version;

      in
      {
        packages = {
          default = self.packages.${system}.winboat;
          
          winboat = pkgs.stdenv.mkDerivation {
            pname = "winboat";
            inherit version;
            
            src = ./.;
            
            nativeBuildInputs = with pkgs; [
              makeWrapper
              imagemagick
            ];

            buildInputs = with pkgs; [
              electron_35
              freerdp
              iptables
              kmod
            ];

            dontConfigure = true;
            dontBuild = true;

            installPhase = ''
              mkdir -p $out/lib/winboat $out/bin $out/share/applications
              
              # Copy artifacts
              cp -r build/main build/renderer $out/lib/winboat/ 
              cp -r node_modules $out/lib/winboat/ 2>/dev/null || true
              cp package*.json $out/lib/winboat/ 2>/dev/null || true
              cp -r icons $out/lib/winboat/ 2>/dev/null || true
              
              # Executable wrapper
              makeWrapper ${pkgs.electron_35}/bin/electron $out/bin/winboat \
                --add-flags "$out/lib/winboat/main/main.js" \
                --set ELECTRON_OVERRIDE_DIST_PATH "${pkgs.electron_35}/bin/" \
                --set ELECTRON_SKIP_BINARY_DOWNLOAD "1" \
                --set NODE_ENV "production" \
                --prefix PATH : ${pkgs.freerdp}/bin \
                --prefix PATH : ${pkgs.iptables}/bin

              # Desktop file
              cat > $out/share/applications/winboat.desktop << EOF
              [Desktop Entry]
              Name=WinBoat
              Comment=Windows for Penguins
              Exec=$out/bin/winboat
              Icon=winboat
              Type=Application
              Categories=Utility;Network;RemoteAccess;
              EOF

              # Icons
              for size in 16 32 48 64 128 256 512; do
                mkdir -p "$out/share/icons/hicolor/''${size}x''${size}/apps"
                ${pkgs.imagemagick}/bin/magick convert icons/icon.png -resize "''${size}x''${size}" \
                  "$out/share/icons/hicolor/''${size}x''${size}/apps/winboat.png" 2>/dev/null || true
              done
            '';

            meta = with pkgs.lib; {
              description = "Windows for Penguins";
              homepage = "https://github.com/TibixDev/winboat";
              license = licenses.mit;
              platforms = platforms.linux;
              mainProgram = "winboat";
            };
          };
        };

        # Development shell
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_20
            nodePackages.typescript
            electron_35
            python3
            pkg-config
            vips
            pixman
            cairo
            pango
            libpng
            libjpeg

            nodePackages.vscode-langservers-extracted
            nodePackages.typescript-language-server
          ];

          shellHook = ''
            export ELECTRON_OVERRIDE_DIST_PATH=${pkgs.electron_35}/bin/
            export ELECTRON_SKIP_BINARY_DOWNLOAD=1
          '';
        };

        apps.default = {
          type = "app";
          program = "${self.packages.${system}.winboat}/bin/winboat";
        };

        formatter = pkgs.nixpkgs-fmt;
      });
}
