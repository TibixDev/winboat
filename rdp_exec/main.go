package main

import (
	"flag"
	"os"
	"strings"
	"syscall"
	"unsafe"
)

var (
	cmd   = flag.String("cmd", "", "Command to run")
	dummy = flag.String("dummy", "", "Dummy info")
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

func main() {
	flag.Parse()

	if *cmd == "" || *dummy == "" {
		os.Exit(1)
	}

	args := strings.Fields(*cmd)

	if len(args) == 0 {
		os.Exit(1)
	}

	expandedCmd := expandWindowsEnv(*cmd)
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
