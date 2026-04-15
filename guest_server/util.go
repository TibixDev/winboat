//go:build windows
// +build windows

package main

import (
	"log"
	"os"
)

func checkErr(err error) {
	if err != nil {
		log.Fatal(err)
	}
}

// Copy a file from src to dst
func copyFile(src string, dst string) {
	info, err := os.Stat(src)
	checkErr(err)

	// Read all content of src to data, may cause OOM for a large file.
	data, err := os.ReadFile(src)
	checkErr(err)
	// Write data to dst
	err = os.WriteFile(dst, data, info.Mode())
	checkErr(err)
}
