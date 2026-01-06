FLATPAK_GO_MOD = go run github.com/dennwc/flatpak-go-mod@v0.1.0
FLATPAK_NODE_GENERATOR = flatpak run --command=flatpak-node-generator org.flatpak.Builder

.PHONY: js-sources.json
js-sources.json:
	$(FLATPAK_NODE_GENERATOR) npm ../package-lock.json -o $@ --electron-node-headers

.PHONY: go-sources.json
go-sources.json:
	cd ../guest_server && $(FLATPAK_GO_MOD) -dest-pref main/guest_server/ -json .
	mv ../guest_server/modules.txt ./
	mv ../guest_server/go.mod.json $@
