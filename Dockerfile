ARG GO_IMAGE=golang:1.25-alpine
ARG FLATPAK_IMAGE=ghcr.io/flathub-infra/flatpak-github-actions:freedesktop-25.08

FROM ${GO_IMAGE} AS go-sources
WORKDIR /workdir
COPY guest_server .
RUN go run github.com/dennwc/flatpak-go-mod@v0.1.0 -dest-pref main/guest_server/ -json .

FROM ${FLATPAK_IMAGE} AS js-sources
WORKDIR /workdir
COPY package-lock.json .
RUN flatpak-node-generator npm package-lock.json -o output.json --electron-node-headers

FROM scratch AS dependency-manifests
COPY --from=go-sources /workdir/modules.txt modules.txt
COPY --from=go-sources /workdir/go.mod.json go-sources.json
COPY --from=js-sources /workdir/output.json js-sources.json

FROM ${FLATPAK_IMAGE} AS flatpak
ARG FLATPAK_REPO=https://flathub.org/repo/flathub.flatpakrepo
WORKDIR /workdir
COPY . .
COPY --from=dependency-manifests /* flatpak/
RUN flatpak remote-add --user flathub ${FLATPAK_REPO}
RUN --security=insecure flatpak-builder \
    --user --disable-rofiles-fuse --install-deps-from=flathub \
    --repo=/tmp/repo /tmp/builddir flatpak/app.winboat.Winboat.yml
RUN flatpak build-bundle /tmp/repo winboat.flatpak app.winboat.Winboat \
    --runtime-repo=${FLATPAK_REPO}

FROM scratch AS flatpak-bundle
COPY --from=flatpak /workdir/winboat.flatpak /
