FROM fedora:44

RUN dnf -y update && \
    dnf -y install \
    git \
    procps-ng \
    shadow-utils \
    passwd \
    gcc \
    gcc-c++ \
    systemd-devel \
    make \
    rpm \
    rpm-build \
    pkgconf-pkg-config \
    systemd-devel \
    libxcrypt-compat \
    glib2-devel \
    gtk3-devel \
    webkit2gtk4.1-devel \
    libnotify-devel \
    openssl-devel \
    ca-certificates \
    tar \
    zip \
    gzip \
    xz \
    && dnf clean all

# Create vscode user
RUN useradd -ms /bin/bash vscode && \
    echo "vscode ALL=(ALL) NOPASSWD:ALL" >/etc/sudoers.d/vscode

# Go
ARG GO_VERSION=1.24.5
RUN curl -fsSL https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz \
    | tar -C /usr/local -xz

ENV PATH="/usr/local/go/bin:${PATH}"

USER vscode

# Bun
RUN curl -fsSL https://bun.sh/install | bash

ENV BUN_INSTALL=/home/vscode/.bun
ENV PATH="${BUN_INSTALL}/bin:/usr/local/go/bin:${PATH}"

WORKDIR /workspaces/winboat