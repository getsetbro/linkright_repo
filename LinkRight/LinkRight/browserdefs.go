package main

import (
	"embed"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// ─── Embedded baseline ────────────────────────────────────────────────────────

//go:embed browser-defs.json
var embeddedDefsFS embed.FS

// ─── Structs ──────────────────────────────────────────────────────────────────

// BrowserDefs is the root structure of the browser definitions file.
// Profile support is determined solely by browser type (only Chromium-based
// browsers support profiles). The definitions file only carries a list of
// browsers to exclude entirely.
type BrowserDefs struct {
	SchemaVersion       int      `json:"schema_version"`
	Updated             string   `json:"updated"`
	UnsupportedBrowsers []string `json:"unsupported_browsers"` // browser name substrings to exclude entirely
}

// MSIXBrowserDef defines a known MSIX-packaged browser (hardcoded).
type MSIXBrowserDef struct {
	ExeName         string
	DisplayName     string
	PackageFamilyID string
	BrowserType     string
}

// ─── File paths ───────────────────────────────────────────────────────────────

func defsActivePath() string {
	return filepath.Join(configDir(), "browser-defs.active.json")
}

// ─── Loading (2-layer fallback) ───────────────────────────────────────────────

// activeDefs is the package-level cached defs loaded at startup.
var activeDefs *BrowserDefs

// LoadActiveDefs loads browser definitions with fallback:
// 1. cached active file on disk
// 2. embedded baseline
func LoadActiveDefs() *BrowserDefs {
	// Try cached active file
	if data, err := os.ReadFile(defsActivePath()); err == nil {
		var defs BrowserDefs
		if json.Unmarshal(data, &defs) == nil && defs.SchemaVersion > 0 {
			activeDefs = &defs
			return activeDefs
		}
	}

	// Fall back to embedded
	activeDefs = loadEmbeddedDefs()
	return activeDefs
}

func loadEmbeddedDefs() *BrowserDefs {
	data, err := embeddedDefsFS.ReadFile("browser-defs.json")
	if err != nil {
		panic("embedded browser-defs.json missing: " + err.Error())
	}
	var defs BrowserDefs
	if err := json.Unmarshal(data, &defs); err != nil {
		panic("embedded browser-defs.json invalid: " + err.Error())
	}
	return &defs
}

// GetDefs returns the currently active defs (cached in memory).
func GetDefs() *BrowserDefs {
	if activeDefs == nil {
		LoadActiveDefs()
	}
	return activeDefs
}

// ─── Hardcoded browser logic ──────────────────────────────────────────────────

// DefsDetectBrowserType determines browser type from name/path using hardcoded rules.
func DefsDetectBrowserType(name, path string) string {
	nameLower := strings.ToLower(name)
	pathLower := strings.ToLower(path)

	// Firefox detection
	if strings.Contains(nameLower, "firefox") || strings.Contains(pathLower, "firefox") {
		return "firefox"
	}

	// Chromium-based browsers
	chromiumKeywords := []string{"chrome", "edge", "msedge", "brave", "opera", "vivaldi", "arc"}
	for _, kw := range chromiumKeywords {
		if strings.Contains(nameLower, kw) || strings.Contains(pathLower, kw) {
			return "chromium"
		}
	}

	// Arc-specific detection (exe name)
	if strings.HasSuffix(pathLower, "\\arc.exe") || strings.HasSuffix(pathLower, "/arc.exe") {
		return "chromium"
	}
	if nameLower == "arc" {
		return "chromium"
	}

	return "other"
}


// IsUnsupportedBrowser checks whether a browser should be excluded entirely.
func IsUnsupportedBrowser(name, path string) bool {
	defs := GetDefs()
	nameLower := strings.ToLower(name)
	pathLower := strings.ToLower(path)
	for _, pattern := range defs.UnsupportedBrowsers {
		needle := strings.ToLower(pattern)
		if strings.Contains(nameLower, needle) || strings.Contains(pathLower, needle) {
			return true
		}
	}
	return false
}

// DefsBuildLaunchArgs constructs command-line arguments for launching a browser.
// Only Chromium-based browsers support profile selection; all others are launched
// with just the URL.
func DefsBuildLaunchArgs(browserPath, profileID, url string) []string {
	browserType := DefsDetectBrowserType("", browserPath)

	switch browserType {
	case "chromium":
		// Chromium: use --profile-directory flag if profile exists
		if profileID != "" && profileID != "Default" {
			if chromiumProfileExists(browserPath, profileID) {
				return []string{"--profile-directory=" + profileID, url}
			}
		}
		return []string{url}
	default:
		// Non-Chromium browsers do not support profiles — just pass the URL
		return []string{url}
	}
}

// DefsGetMSIXBrowsers returns the hardcoded list of known MSIX-packaged browsers.
func DefsGetMSIXBrowsers() []MSIXBrowserDef {
	return []MSIXBrowserDef{
		{
			ExeName:         "Arc.exe",
			DisplayName:     "Arc",
			PackageFamilyID: "TheBrowserCompany.Arc_ttt1ap7aakyb4",
			BrowserType:     "chromium",
		},
		{
			ExeName:         "DuckDuckGo.exe",
			DisplayName:     "DuckDuckGo",
			PackageFamilyID: "DuckDuckGo.DesktopBrowser_ya2fgkz3nks94",
			BrowserType:     "other",
		},
	}
}

