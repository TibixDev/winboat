#!/bin/sh -e

source "$(dirname "$0")/common-script.sh"

installPodmanCompose() {
    if ! command_exists podman-compose; then
        printf "%b\n" "${YELLOW}Installing Podman Compose...${RC}"
        case "$PACKAGER" in
            apt-get|nala|dnf)
                "$ESCALATION_TOOL" "$PACKAGER" install -y podman-compose
                ;;
            pacman)
                "$ESCALATION_TOOL" "$PACKAGER" -S --noconfirm --needed podman-compose
                ;;
            apk)
                "$ESCALATION_TOOL" "$PACKAGER" add podman-compose
                ;;
            xbps-install)
                "$ESCALATION_TOOL" "$PACKAGER" -Sy podman-compose
                ;;
            zypper)
                if [ -e /etc/os-release ]; then
                   . /etc/os-release
                else
                   . /usr/lib/os-release
                fi

                if [ "$ID" = "opensuse-leap" ]; then
                    zypper addrepo https://download.opensuse.org/repositories/devel:languages:python/$VERSION_ID/devel:languages:python.repo
                    zypper refresh
                    zypper install -y python-podman-compose
                elif [ "$ID" = "opensuse-tumbleweed" ]; then
                    "$ESCALATION_TOOL" "$PACKAGER" install -y podman-compose
                else
                    printf "%b\n" "${RED}Unsupported openSUSE distro: ${PACKAGER}${RC}"
                    exit 1
                fi
                ;;
            *)
                printf "%b\n" "${RED}Unsupported package manager: ${PACKAGER}${RC}"
                exit 1
                ;;
        esac
    else
        printf "%b\n" "${GREEN}Podman Compose is already installed.${RC}"
    fi
}

installPodman() {
    if ! command_exists podman; then
        printf "%b\n" "${YELLOW}Installing Podman...${RC}"
        case "$PACKAGER" in
            pacman)
                "$ESCALATION_TOOL" "$PACKAGER" -S --noconfirm --needed podman
                ;;
            apk)
                "$ESCALATION_TOOL" "$PACKAGER" add podman
                ;;
            xbps-install)
                "$ESCALATION_TOOL" "$PACKAGER" -Sy podman
                ;;
            *)
                "$ESCALATION_TOOL" "$PACKAGER" install -y podman
                ;;
        esac
    else
        printf "%b\n" "${GREEN}Podman is already installed.${RC}"
    fi
}

checkEnv
checkEscalationTool
installPodman
installPodmanCompose

source "$(dirname "$0")/autosetup_freerdp.sh"