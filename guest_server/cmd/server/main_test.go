package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGraphicsProvisioningStatus(t *testing.T) {
	programData := t.TempDir()
	t.Setenv("ProgramData", programData)

	request := httptest.NewRequest(http.MethodGet, "/provisioning/graphics/status", nil)
	recorder := httptest.NewRecorder()
	getGraphicsProvisioningStatus(recorder, request)
	if recorder.Code != http.StatusOK || strings.TrimSpace(recorder.Body.String()) != `{"status":"waiting"}` {
		t.Fatalf("missing status: code=%d body=%q", recorder.Code, recorder.Body.String())
	}

	statusDir := filepath.Join(programData, "Helios")
	if err := os.MkdirAll(statusDir, 0o755); err != nil {
		t.Fatal(err)
	}
	status := `{"status":"driver-restart-required","message":"ready"}`
	withBOM := append([]byte{0xEF, 0xBB, 0xBF}, []byte(status)...)
	if err := os.WriteFile(filepath.Join(statusDir, "provisioning-status.json"), withBOM, 0o644); err != nil {
		t.Fatal(err)
	}

	recorder = httptest.NewRecorder()
	getGraphicsProvisioningStatus(recorder, request)
	if recorder.Code != http.StatusOK || strings.TrimSpace(recorder.Body.String()) != status {
		t.Fatalf("persisted status: code=%d body=%q", recorder.Code, recorder.Body.String())
	}
}

func TestGraphicsProvisioningRejectsInvalidJSON(t *testing.T) {
	programData := t.TempDir()
	t.Setenv("ProgramData", programData)
	statusDir := filepath.Join(programData, "Helios")
	if err := os.MkdirAll(statusDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(statusDir, "provisioning-status.json"), []byte("invalid"), 0o644); err != nil {
		t.Fatal(err)
	}

	recorder := httptest.NewRecorder()
	getGraphicsProvisioningStatus(
		recorder,
		httptest.NewRequest(http.MethodGet, "/provisioning/graphics/status", nil),
	)
	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("code=%d body=%q", recorder.Code, recorder.Body.String())
	}
}
