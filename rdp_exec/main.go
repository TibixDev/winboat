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

func main() {
	flag.Parse()

	if *cmd == "" || *dummy == "" {
		os.Exit(1)
	}

	args := strings.Fields(*cmd)

	if len(args) == 0 {
		os.Exit(1)
	}

	appName := syscall.StringToUTF16Ptr(args[0])
	commandLine := syscall.StringToUTF16Ptr(*cmd)
	workingDir := syscall.StringToUTF16Ptr(`C:\Windows\System32`)

	var startupInfo syscall.StartupInfo
	var processInfo syscall.ProcessInformation

	startupInfo.Cb = uint32(unsafe.Sizeof(startupInfo))

	syscall.CreateProcess(
		appName,
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
