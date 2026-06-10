package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// httpGet performs a simple GET request with a short timeout.
// Returns the response body bytes or an error.
func httpGet(url string) ([]byte, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	// Limit read to 1MB to prevent abuse
	return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
}

// ─── App methods exposed to frontend ──────────────────────────────────────────

// pendingUpdate holds the fetched candidate between Check and Apply calls.
var pendingUpdate *BrowserDefs

// GetDefsStatus returns the current browser definitions status for the UI.
func (a *App) GetDefsStatus() DefsStatus {
	defs := GetDefs()
	_, err := os.Stat(defsPreviousPath())
	return DefsStatus{
		Version:     defs.SchemaVersion,
		Updated:     defs.Updated,
		Source:      getDefsSource(),
		SourceURL:   defsRemoteURL,
		HasPrevious: err == nil,
		LastChecked: getLastChecked(),
	}
}

// CheckForDefsUpdate fetches the remote definitions and compares versions.
// The result is held in memory — nothing is written to disk until ApplyDefsUpdate.
func (a *App) CheckForDefsUpdate() DefsUpdateResult {
	saveLastChecked()

	remote, err := fetchRemoteDefs()
	if err != nil {
		return DefsUpdateResult{
			Available: false,
			Error:     err.Error(),
		}
	}

	current := GetDefs()

	// Consider it "available" if the remote updated date is different or version is higher
	isNewer := remote.Updated != current.Updated || remote.SchemaVersion > current.SchemaVersion
	if !isNewer {
		pendingUpdate = nil
		return DefsUpdateResult{
			Available:  false,
			NewVersion: remote.SchemaVersion,
			NewUpdated: remote.Updated,
		}
	}

	// Hold in memory for Apply
	pendingUpdate = remote
	return DefsUpdateResult{
		Available:  true,
		NewVersion: remote.SchemaVersion,
		NewUpdated: remote.Updated,
		NewNotes:   remote.Notes,
	}
}

// ApplyDefsUpdate writes the pending update to disk and reloads.
// Returns an error string (empty on success).
func (a *App) ApplyDefsUpdate() string {
	if pendingUpdate == nil {
		return "No pending update to apply"
	}
	if err := applyDefsUpdate(pendingUpdate); err != nil {
		return err.Error()
	}
	pendingUpdate = nil
	return ""
}

// RevertDefsUpdate reverts to the previous definitions version.
// Returns an error string (empty on success).
func (a *App) RevertDefsUpdate() string {
	if err := revertDefs(); err != nil {
		return err.Error()
	}
	return ""
}

// ResetDefsToBuiltin resets definitions to the compiled-in baseline.
func (a *App) ResetDefsToBuiltin() {
	resetDefsToBuiltin()
}
