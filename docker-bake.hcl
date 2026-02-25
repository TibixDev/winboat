group "default" {
  targets = ["flatpak"]
}

target "flatpak" {
  description = "Build a flatpak bundle"
  output = [{
    type = "local"
    dest = "build"
  }]
  target = "flatpak-bundle"
  entitlements = ["security.insecure"] // req. by flatpak-builder
}
