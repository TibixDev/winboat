#!/bin/sh -e

source "$(dirname "$0")/common-script.sh"

installFreeRdp() {
    if ! command_exists xfreerdp && ! command_exists xfreerdp3 && ! flatpak info com.freerdp.FreeRDP >/dev/null 2>&1; then
        flatpak install -y --system flathub com.freerdp.FreeRDP
    else
        printf "%b\n" "${CYAN}FreeRDP is installed${RC}"
    fi
}

checkFlatpak
installFreeRdp