//go:build windows

package main

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// installRoot derives the WinBoat root from the updater directory.
func installRoot() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Dir(filepath.Dir(exe)), nil
}

// applyUpdate swaps in a new server package and rolls back failed health checks.
func applyUpdate(zipData []byte) error {
	root, err := installRoot()
	if err != nil {
		return fmt.Errorf("resolve install root: %w", err)
	}
	serverDir := filepath.Join(root, "server")
	newDir := filepath.Join(root, "server.new")
	oldDir := filepath.Join(root, "server.old")
	brokenDir := filepath.Join(root, "server.broken")

	// Remove leftovers from an interrupted update.
	for _, d := range []string{newDir, oldDir, brokenDir} {
		os.RemoveAll(d)
	}

	// Stage and validate the replacement.
	if err := extractZip(zipData, newDir); err != nil {
		os.RemoveAll(newDir)
		return fmt.Errorf("extract update: %w", err)
	}
	if _, err := os.Stat(filepath.Join(newDir, "winboat_guest_server.exe")); err != nil {
		os.RemoveAll(newDir)
		return fmt.Errorf("update payload is missing winboat_guest_server.exe")
	}

	// Abort before swapping files if the current server cannot be stopped.
	if err := stopService(guestServiceName, stopTimeout); err != nil {
		os.RemoveAll(newDir)
		_ = startService(guestServiceName) // Stop may have completed after timeout.
		return fmt.Errorf("stop guest server: %w", err)
	}

	// Same-volume renames keep the swap fast and nearly atomic.
	serverExists := false
	if _, err := os.Stat(serverDir); err == nil {
		serverExists = true
		if err := os.Rename(serverDir, oldDir); err != nil {
			_ = startService(guestServiceName)
			os.RemoveAll(newDir)
			return fmt.Errorf("archive current server: %w", err)
		}
	}
	if err := os.Rename(newDir, serverDir); err != nil {
		if serverExists {
			_ = os.Rename(oldDir, serverDir)
		}
		_ = startService(guestServiceName)
		os.RemoveAll(newDir)
		return fmt.Errorf("install new server: %w", err)
	}

	// Start the replacement and wait for it to pass the health check.
	if err := startService(guestServiceName); err == nil && waitHealthy(guestHealthURL, healthTimeout) {
		os.RemoveAll(oldDir)
		return nil
	}

	// Preserve server.old until the replacement is moved aside.
	log.Println("New guest server did not become healthy, rolling back...")

	// Stop the bad server to unlock its executable before renaming.
	if err := stopService(guestServiceName, stopTimeout); err != nil {
		return fmt.Errorf("new guest server is unhealthy and could not be stopped for rollback (previous version preserved in %q): %w", oldDir, err)
	}

	if !serverExists {
		// No previous version to restore.
		os.RemoveAll(brokenDir)
		_ = os.Rename(serverDir, brokenDir)
		return fmt.Errorf("new guest server did not become healthy and there was no previous version to roll back to")
	}

	os.RemoveAll(brokenDir)
	if err := os.Rename(serverDir, brokenDir); err != nil {
		return fmt.Errorf("new guest server is unhealthy and could not be moved aside for rollback (previous version preserved in %q): %w", oldDir, err)
	}
	if err := os.Rename(oldDir, serverDir); err != nil {
		return fmt.Errorf("CRITICAL: rollback failed, previous server could not be restored from %q: %w", oldDir, err)
	}
	if err := startService(guestServiceName); err != nil {
		return fmt.Errorf("rolled back to previous server but failed to restart it: %w", err)
	}
	return fmt.Errorf("new guest server did not become healthy; rolled back to the previous version")
}

// waitHealthy accepts 401 because it proves the server is running and enforcing auth.
func waitHealthy(url string, timeout time.Duration) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusUnauthorized {
				return true
			}
		}
		time.Sleep(1 * time.Second)
	}
	return false
}

// extractZip rejects zip-slip path traversal.
func extractZip(data []byte, dest string) error {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}
	for _, f := range zr.File {
		target := filepath.Join(dest, f.Name)
		rel, err := filepath.Rel(dest, target)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
			return fmt.Errorf("illegal path in archive: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		if err := writeZipEntry(f, target); err != nil {
			return err
		}
	}
	return nil
}

func writeZipEntry(f *zip.File, target string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()

	out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, rc)
	return err
}
