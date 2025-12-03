#!/bin/sh -e

[ -z $1 ] && echo "Missing user argument" && exit 1

source "$(dirname "$0")/common-script.sh"
source "$(dirname "$0")/common-service-script.sh"
USERNAME=$1

install_docker() {
    printf "%b\n" "${YELLOW}Installing Docker...${RC}"
    case "$PACKAGER" in
        apt-get|nala)
            curl -fsSL https://get.docker.com | sh 
            ;;
        dnf)
            "$ESCALATION_TOOL" "$PACKAGER" -y install dnf-plugins-core
            dnf_version=$(dnf --version | head -n 1 | cut -d '.' -f 1)
            if [ "$dnf_version" -eq 4 ]; then
                "$ESCALATION_TOOL" "$PACKAGER" config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
            else
                "$ESCALATION_TOOL" "$PACKAGER" config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo
            fi
            "$ESCALATION_TOOL" "$PACKAGER" -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin
            "$ESCALATION_TOOL" systemctl enable --now docker
            ;;
        zypper|eopkg)
            "$ESCALATION_TOOL" "$PACKAGER" install -y docker
            ;;
        pacman)
            "$ESCALATION_TOOL" "$PACKAGER" -S --noconfirm docker
            ;;
        apk)
            "$ESCALATION_TOOL" "$PACKAGER" add docker
            ;;
        xbps-install)
            "$ESCALATION_TOOL" "$PACKAGER" -Sy docker
            ;;
        *)
            printf "%b\n" "${RED}Unsupported package manager: ""$PACKAGER""${RC}"
            exit 1
            ;;
    esac

    startAndEnableService docker
}

install_docker_compose() {
    printf "%b\n" "${YELLOW}Installing Docker Compose...${RC}"
    case "$PACKAGER" in
        apt-get|nala)
            "$ESCALATION_TOOL" "$PACKAGER" install -y docker-compose-plugin
            ;;
        dnf)
            "$ESCALATION_TOOL" "$PACKAGER" -y install dnf-plugins-core
            dnf_version=$(dnf --version | head -n 1 | cut -d '.' -f 1)
            if [ "$dnf_version" -eq 4 ]; then
                "$ESCALATION_TOOL" "$PACKAGER" config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
            else
                "$ESCALATION_TOOL" "$PACKAGER" config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo
            fi
            "$ESCALATION_TOOL" "$PACKAGER" install -y docker-compose-plugin
            ;;
        zypper|eopkg)
            "$ESCALATION_TOOL" "$PACKAGER" install -y docker-compose
            ;;
        pacman)
            "$ESCALATION_TOOL" "$PACKAGER" -S --needed --noconfirm docker-compose
            ;;
        apk)
            "$ESCALATION_TOOL" "$PACKAGER" add docker-cli-compose
            ;;
        xbps-install)
            "$ESCALATION_TOOL" "$PACKAGER" -Sy docker-compose
            ;;
        *)
            printf "%b\n" "${RED}Unsupported package manager: ""$PACKAGER""${RC}"
            exit 1
            ;;
    esac
}

docker_permission() {
    printf "%b\n" "${YELLOW}Adding current user to the docker group...${RC}"
    "$ESCALATION_TOOL" usermod -aG docker "$USERNAME"
    printf "%b\n" "${GREEN}User $USERNAME added to the docker group successfully.${RC}"
}

checkEnv
checkEscalationTool
install_docker
install_docker_compose
docker_permission

source "$(dirname "$0")/autosetup_freerdp.sh"