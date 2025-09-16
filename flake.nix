{
  description = "A Nix flake for winboat";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        packages.winboat = pkgs.callPackage ./packages/winboat { };
        packages.default = self.packages.${system}.winboat;
      });
}
