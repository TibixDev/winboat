//go:build windows

package main

import (
	"os/exec"
	"strings"
)

func executePowerShellScript(script string, utf8Out bool, args ...string) ([]byte, error) {
	powerShellArgs := []string{"-ExecutionPolicy", "Bypass"}
	if utf8Out {
		command := "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; & " + quotePowerShellArgument(script)
		for _, arg := range args {
			command += " " + quotePowerShellArgument(arg)
		}
		powerShellArgs = append(powerShellArgs, "-Command", command)
	} else {
		powerShellArgs = append(powerShellArgs, "-File", script)
		powerShellArgs = append(powerShellArgs, args...)
	}

	return exec.Command("powershell", powerShellArgs...).Output()
}

func quotePowerShellArgument(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}
