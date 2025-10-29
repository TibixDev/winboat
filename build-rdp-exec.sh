cd rdp_exec
GOOS=windows GOARCH=amd64 go build -o rdp_exec.exe -ldflags="-H windowsgui"