package main

import (
	"encoding/base64"
	"flag"
	"fmt"
	"os"
	"path/filepath"
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
	kernel32              = syscall.NewLazyDLL("kernel32.dll")
	shlwapi               = syscall.NewLazyDLL("Shlwapi.dll")
	procAssocQueryStringW = shlwapi.NewProc("AssocQueryStringW")
	procExpandEnvString   = kernel32.NewProc("ExpandEnvironmentStringsW")
)

const (
	ASSOCF_NONE         = 0
	ASSOCSTR_EXECUTABLE = 2
)

func getDefaultApp(extension string) (string, error) {
	if !strings.HasPrefix(extension, ".") {
		extension = "." + extension
	}

	extUTF16, err := syscall.UTF16PtrFromString(extension)
	if err != nil {
		return "", err
	}

	var size uint32 = 260
	buf := make([]uint16, size)

	ret, _, _ := procAssocQueryStringW.Call(
		uintptr(ASSOCF_NONE),
		uintptr(ASSOCSTR_EXECUTABLE),
		uintptr(unsafe.Pointer(extUTF16)),
		0,
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(unsafe.Pointer(&size)),
	)

	if ret != 0 {
		return "", fmt.Errorf("failed to get default app")
	}

	return syscall.UTF16ToString(buf), nil
}

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

	ext := strings.ToLower(filepath.Ext(cmd_decoded))

	if ext != "" && ext != ".exe" && ext != ".bat" && ext != ".cmd" {
		defaultApp, err := getDefaultApp(ext)
		if err == nil {
			cmd_decoded = `"` + defaultApp + `" "` + cmd_decoded + `"`
		}
	}

	cmd_full = cmd_decoded

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
