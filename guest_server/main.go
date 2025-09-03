//go:build windows
// +build windows

package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/gorilla/mux"
	"github.com/shirou/gopsutil/cpu"
	"github.com/shirou/gopsutil/disk"
	"github.com/shirou/gopsutil/mem"
)

var (
	Version        = "0.0.0"
	CommitHash     = "n/a"
	BuildTimestamp = "n/a"
)

type Metrics struct {
	CPU struct {
		Usage     float64 `json:"usage"`     // Percentage, 0-100
		Frequency uint64  `json:"frequency"` // MHz
	} `json:"cpu"`
	RAM struct {
		Used       uint64  `json:"used"`       // MB
		Total      uint64  `json:"total"`      // MB
		Percentage float64 `json:"percentage"` // %
	} `json:"ram"`
	Disk struct {
		Used       uint64  `json:"used"`       // MB
		Total      uint64  `json:"total"`      // MB
		Percentage float64 `json:"percentage"` // %
	} `json:"disk"`
}

func getApps(w http.ResponseWriter, r *http.Request) {
	// Run the PowerShell script
	cmd := exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-File", "scripts\\apps.ps1")
	output, err := cmd.Output()
	if err != nil {
		http.Error(w, "Failed to execute script: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(output)
}

func getHealth(w http.ResponseWriter, r *http.Request) {
	// Simple health check
	response := map[string]string{"status": "ok"}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

func getVersion(w http.ResponseWriter, r *http.Request) {
	response := map[string]string{
		"version":     Version,
		"commit_hash": CommitHash,
		"build_time":  BuildTimestamp,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

func getMetrics(w http.ResponseWriter, r *http.Request) {
	// CPU stats
	cpuPercent, err := cpu.Percent(time.Second/4, false)
	if err != nil {
		http.Error(w, "Failed to get CPU stats: "+err.Error(), http.StatusInternalServerError)
		return
	}
	cpuInfo, err := cpu.Info()
	if err != nil || len(cpuInfo) == 0 {
		http.Error(w, "Failed to get CPU info: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// RAM stats
	memInfo, err := mem.VirtualMemory()
	if err != nil {
		http.Error(w, "Failed to get RAM stats: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Disk stats (using first disk, adjust path if needed)
	diskInfo, err := disk.Usage("C:\\")
	if err != nil {
		http.Error(w, "Failed to get disk stats: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Build metrics struct
	metrics := Metrics{}
	metrics.CPU.Usage = cpuPercent[0]              // Total CPU usage
	metrics.CPU.Frequency = uint64(cpuInfo[0].Mhz) // First CPU's frequency
	metrics.RAM.Used = memInfo.Used / 1024 / 1024  // Bytes to MB
	metrics.RAM.Total = memInfo.Total / 1024 / 1024
	metrics.RAM.Percentage = float64(metrics.RAM.Used) / float64(metrics.RAM.Total) * 100
	metrics.Disk.Used = diskInfo.Used / 1024 / 1024
	metrics.Disk.Total = diskInfo.Total / 1024 / 1024
	metrics.Disk.Percentage = diskInfo.UsedPercent

	// Send it
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(metrics)
}

func getRdpConnectedStatus(w http.ResponseWriter, r *http.Request) {
	// Grep for any active RDP sessions via qwinsta
	// Run the PowerShell script
	cmd := exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-File", "scripts\\rdp-status.ps1")
	output, err := cmd.Output()
	if err != nil {
		http.Error(w, "Failed to execute script: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(output)
}

func applyUpdate(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(100 << 20) // Limit upload size to 100MB
	var buf bytes.Buffer

	// Grab the file
	file, _, err := r.FormFile("updateFile")
	if err != nil {
		http.Error(w, "Failed to get update file: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Copy to buffer & close the file
	io.Copy(&buf, file)
	file.Close()

	// Check zip magic bytes
	if !(buf.Bytes()[0] == 'P' && buf.Bytes()[1] == 'K' && buf.Bytes()[2] == 3 && buf.Bytes()[3] == 4) {
		http.Error(w, "Uploaded file is not a valid ZIP archive", http.StatusBadRequest)
		return
	}

	// Make temp directory
	tmpDir, err := os.MkdirTemp("", "winboat-update")
	if err != nil {
		http.Error(w, "Failed to create temp directory: "+err.Error(), http.StatusInternalServerError)
	}

	// Write to temp file
	fileName := "update.zip"
	tmpFilePath := filepath.Join(tmpDir, fileName)
	err = os.WriteFile(tmpFilePath, buf.Bytes(), 0644)

	if err != nil {
		http.Error(w, "Failed to write temp file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Return success & the paths
	response := map[string]string{
		"status":    "updating",
		"temp_path": tmpFilePath,
		"filename":  fileName,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)

	// Get current executable path & directory
	exePath, err := os.Executable()
	if err != nil {
		http.Error(w, "Failed to get executable path: "+err.Error(), http.StatusInternalServerError)
		return
	}
	appDir := filepath.Dir(exePath)

	// Create & run the script
	scriptPath := filepath.Join(appDir, "scripts\\update.ps1")
	cmd := exec.Command("cmd", "/C", "start", "/B", "powershell",
		"-ExecutionPolicy", "Bypass", "-File", scriptPath,
		"-AppPath", appDir,
		"-UpdateFilePath", tmpFilePath,
		"-ServiceName", "WinBoatGuestServer")

	// The script will take care of the rest, including stopping this service
	cmd.Run()

}

func getIcon(w http.ResponseWriter, r *http.Request) {
	path := r.PostFormValue("path")
	if path == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	cmd := exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-File", "scripts\\get-icon.ps1", "-path", path)
	output, err := cmd.Output()
	if err != nil {
		http.Error(w, "Failed to execute script: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write(output)
}

func main() {
	r := mux.NewRouter()
	r.HandleFunc("/apps", getApps).Methods("GET")
	r.HandleFunc("/health", getHealth).Methods("GET")
	r.HandleFunc("/version", getVersion).Methods("GET")
	r.HandleFunc("/metrics", getMetrics).Methods("GET")
	r.HandleFunc("/rdp/status", getRdpConnectedStatus).Methods("GET")
	r.HandleFunc("/update", applyUpdate).Methods("POST")
	r.HandleFunc("/get-icon", getIcon).Methods("POST")

	log.Println("Starting WinBoat Guest Server on :7148...")
	if err := http.ListenAndServe(":7148", r); err != nil {
		log.Fatal("Server failed: ", err)
	}
}
