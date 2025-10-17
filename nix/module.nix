{
  config,
  lib,
  pkgs,
  ...
}: let
  inherit (lib) mkIf mkEnableOption mkOption;
  inherit (lib.types) package;

  cfg = config.services.winboat;
in {
  options.services.winboat = {
    enable = mkEnableOption "WinBoat - Windows apps on Linux";
    package = mkOption {
      type = package;
      description = "WinBoat package to use";
    };
  };

  config = mkIf cfg.enable {
    virtualisation.docker.enable = true;
    virtualisation.libvirtd.enable = true;

    environment.systemPackages = [
      cfg.package
      pkgs.freerdp3
      pkgs.docker-compose
    ];
  };
}
