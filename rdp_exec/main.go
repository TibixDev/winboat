package main

import (
	"encoding/base64"
	"flag"
	"os"
	"strings"
	"syscall"
	"unsafe"
)

var (
	cmd      = flag.String("cmd", "", "Command to run")
	cmd_args = flag.String("cmd_args", "", "Command args")
	dummy    = flag.String("dummy", "", "Dummy info")
)

var (
	kernel32            = syscall.NewLazyDLL("kernel32.dll")
	procExpandEnvString = kernel32.NewProc("ExpandEnvironmentStringsW")
)

func expandWindowsEnv(s string) string {
	utf16Str, _ := syscall.UTF16FromString(s)

	n, _, _ := procExpandEnvString.Call(
		uintptr(unsafe.Pointer(&utf16Str[0])),
		0,
		0,
	)

	if n == 0 {
		return s
	}

	buf := make([]uint16, n)
	procExpandEnvString.Call(
		uintptr(unsafe.Pointer(&utf16Str[0])),
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(n),
	)

	return syscall.UTF16ToString(buf)
}

func decodeb64(b64 string) string {
	res, _ := base64.StdEncoding.DecodeString(b64)
	return string(res)
}

func main() {
	flag.Parse()

	if *cmd == "" || *dummy == "" {
		os.Exit(1)
	}

	cmd_decoded := decodeb64(*cmd)
	args := strings.Fields(cmd_decoded)

	if len(args) == 0 {
		os.Exit(1)
	}

	cmd_full := cmd_decoded

	if *cmd_args != "" {
		cmd_full += " " + decodeb64(*cmd_args)
	}

	expandedCmd := expandWindowsEnv(cmd_full)
	commandLine := syscall.StringToUTF16Ptr(expandedCmd)
	workingDir := syscall.StringToUTF16Ptr(`C:\Windows\System32`)

	var startupInfo syscall.StartupInfo
	var processInfo syscall.ProcessInformation

	startupInfo.Cb = uint32(unsafe.Sizeof(startupInfo))

	syscall.CreateProcess(
		nil,
		commandLine,
		nil,   // Default process security attributes
		nil,   // Default thread security attributes
		false, // Inherit handles
		0,     // Creation flags
		nil,   // Use parent's environment
		workingDir,
		&startupInfo,
		&processInfo,
	)

	syscall.WaitForSingleObject(processInfo.Process, syscall.INFINITE)
	syscall.CloseHandle(processInfo.Process)
	syscall.CloseHandle(processInfo.Thread)
}
