package main

import (
	"flag"
	"fmt"
	"log"
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
		log.Fatal("Missing arguments!")
		os.Exit(1)
	}

	fmt.Println(*cmd)
	fmt.Println(*dummy)

	args := strings.Fields(*cmd)
	if len(args) == 0 {
		log.Fatal("Command is empty!")
	}

	appName := syscall.StringToUTF16Ptr(args[0])

	commandLine := syscall.StringToUTF16Ptr(*cmd)

	var startupInfo syscall.StartupInfo
	var processInfo syscall.ProcessInformation

	startupInfo.Cb = uint32(unsafe.Sizeof(startupInfo))

	err := syscall.CreateProcess(
		appName,
		commandLine,
		nil,   // Default process security attributes
		nil,   // Default thread security attributes
		false, // Inherit handles
		0,     // Creation flags
		nil,   // Use parent's environment
		nil,   // Use parent's current directory
		&startupInfo,
		&processInfo,
	)

	if err != nil {
		log.Fatalf("Error calling CreateProcess: %v", err)
	}

	fmt.Printf("Process started with PID: %d\n", processInfo.ProcessId)

	syscall.WaitForSingleObject(processInfo.Process, syscall.INFINITE)
	fmt.Println("Process finished.")

	syscall.CloseHandle(processInfo.Process)
	syscall.CloseHandle(processInfo.Thread)
}
