//go:build windows

// Command winboat_guest_server_updater installs Guest Server updates and rolls
// back failed deployments.
package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"winboat-guest/internal/guestauth"
)

// updateMu prevents concurrent directory swaps.
var updateMu sync.Mutex

const (
	listenAddr       = ":7150"
	guestServiceName = "WinBoatGuestServer"
	guestHealthURL   = "http://127.0.0.1:7148/health"

	maxUpdateBytes = 100 << 20 // 100 MiB
	stopTimeout    = 60 * time.Second
	healthTimeout  = 45 * time.Second
)

func handleUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if !updateMu.TryLock() {
		http.Error(w, "An update is already in progress", http.StatusConflict)
		return
	}
	defer updateMu.Unlock()

	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxUpdateBytes))
	if err != nil {
		http.Error(w, "Failed to read update payload: "+err.Error(), http.StatusBadRequest)
		return
	}
	if _, err := zip.NewReader(bytes.NewReader(data), int64(len(data))); err != nil {
		http.Error(w, "Payload is not a valid ZIP archive", http.StatusBadRequest)
		return
	}

	log.Printf("Received update payload (%d bytes), applying...", len(data))
	if err := applyUpdate(data); err != nil {
		log.Printf("Update failed: %v", err)
		http.Error(w, "Update failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Println("Update applied successfully")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func main() {
	token, err := guestauth.LoadToken()
	if err != nil {
		log.Fatalf("Failed to load guest token: %v", err)
	}

	auth := guestauth.Middleware(token)
	mux := http.NewServeMux()
	mux.Handle("/update", auth(http.HandlerFunc(handleUpdate)))
	mux.HandleFunc("/health", handleHealth)

	srv := &http.Server{
		Addr:              listenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second, // Prevent Slowloris / DoS for headers
	}

	log.Println("Starting WinBoat Guest Server Updater on :7150...")
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal("Updater failed: ", err)
	}
}
