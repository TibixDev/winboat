//go:build windows

package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os/exec"
	"strings"
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

type RDPStatusResponse struct {
	RdpConnection bool `json:"rdpConnected"`
}

func getApps(w http.ResponseWriter, r *http.Request) {
	output, err := executePowerShellScript(".\\scripts\\apps.ps1", true)
	if err != nil {
		http.Error(w, "Failed to execute script: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(output)
}

func getHealth(w http.ResponseWriter, r *http.Request) {
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

	memInfo, err := mem.VirtualMemory()
	if err != nil {
		http.Error(w, "Failed to get RAM stats: "+err.Error(), http.StatusInternalServerError)
		return
	}

	diskInfo, err := disk.Usage("C:\\")
	if err != nil {
		http.Error(w, "Failed to get disk stats: "+err.Error(), http.StatusInternalServerError)
		return
	}

	metrics := Metrics{}
	metrics.CPU.Usage = cpuPercent[0]
	metrics.CPU.Frequency = uint64(cpuInfo[0].Mhz)
	metrics.RAM.Used = memInfo.Used / 1024 / 1024
	metrics.RAM.Total = memInfo.Total / 1024 / 1024
	metrics.RAM.Percentage = float64(metrics.RAM.Used) / float64(metrics.RAM.Total) * 100
	metrics.Disk.Used = diskInfo.Used / 1024 / 1024
	metrics.Disk.Total = diskInfo.Total / 1024 / 1024
	metrics.Disk.Percentage = diskInfo.UsedPercent

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(metrics)
}

func getRdpConnectedStatus(w http.ResponseWriter, r *http.Request) {
	cmd := exec.Command("quser.exe")
	output, err := cmd.Output()
	if err != nil {
		http.Error(w, "Failed to execute script: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// TODO: Check for VNC sessions.
	hasRdpSession := strings.Contains(strings.ToLower(string(output)), "active") &&
		strings.Contains(strings.ToLower(string(output)), "rdp")

	response := RDPStatusResponse{
		RdpConnection: hasRdpSession,
	}

	jsonResponse, err := json.Marshal(response)
	if err != nil {
		http.Error(w, "Failed to marshal JSON response: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(jsonResponse)
}

func getIcon(w http.ResponseWriter, r *http.Request) {
	path := r.PostFormValue("path")
	if path == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	output, err := executePowerShellScript("scripts\\get-icon.ps1", false, "-path", path)
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
	r.HandleFunc("/get-icon", getIcon).Methods("POST")

	log.Println("Starting WinBoat Guest Server on :7148...")
	if err := http.ListenAndServe(":7148", r); err != nil {
		log.Fatal("Server failed: ", err)
	}
}
