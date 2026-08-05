package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
)

func getGraphicsProvisioningStatus(w http.ResponseWriter, r *http.Request) {
	programData := os.Getenv("ProgramData")
	if programData == "" {
		programData = `C:\ProgramData`
	}

	data, err := os.ReadFile(filepath.Join(programData, "Helios", "provisioning-status.json"))
	if os.IsNotExist(err) {
		data = []byte(`{"status":"waiting"}`)
	} else if err != nil {
		http.Error(w, "Failed to read graphics provisioning status: "+err.Error(), http.StatusInternalServerError)
		return
	}

	data = bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF})
	if !json.Valid(data) {
		http.Error(w, "Graphics provisioning status is invalid", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}
