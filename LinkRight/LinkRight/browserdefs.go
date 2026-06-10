package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ─── Embedded baseline ────────────────────────────────────────────────────────

//go:embed browser-defs.json
var embeddedDefsFS embed.FS

// ─── Structs ──────────────────────────────────────────────────────────────────

// BrowserDefs is the root structure of the browser definitions file.
type BrowserDefs struct {
	SchemaVersion int                       `json:"schema_version"`
	Updated       string                    `json:"updated"`
	Notes         string                    `json:"notes"`
	BrowserTypes  map[string]BrowserTypeDef `json:"browser_types"`
	TypeDetRules  []TypeDetectionRule       `json:"type_detection_rules"`
	MSIXBrowsers  []MSIXBrowserDef          `json:"msix_browsers"`
}

// BrowserTypeDef defines launch flags and profile directories for a browser type.
type BrowserTypeDef struct {
	LaunchFlags          []string            `json:"launch_flags"`
	LaunchFlagsNoProfile []string            `json:"launch_flags_no_profile"`
	UserDataDirs         map[string]string   `json:"user_data_dirs,omitempty"`
	ChannelDetection     []ChannelDetRule    `json:"channel_detection,omitempty"`
	TypeDetection        []string            `json:"type_detection,omitempty"`
	ProfileDirs          map[string]string   `json:"profile_dirs,omitempty"`
	DevPathIndicators    []string            `json:"developer_path_indicators,omitempty"`
}

// ChannelDetRule maps a path substring to a user-data-dir key.
type ChannelDetRule struct {
	PathContains string `json:"path_contains"`
	DataDirKey   string `json:"data_dir_key"`
}

// TypeDetectionRule determines browser type from name/path.
type TypeDetectionRule struct {
	NameOrPathContains string `json:"name_or_path_contains,omitempty"`
	NameEquals         string `json:"name_equals,omitempty"`
	PathEndsWith       string `json:"path_ends_with,omitempty"`
	Type               string `json:"type"`
}

// MSIXBrowserDef defines a known MSIX-packaged browser.
type MSIXBrowserDef struct {
	ExeName         string `json:"exe_name"`
	DisplayName     string `json:"display_name"`
	PackageFamilyID string `json:"package_family_id"`
	BrowserType     string `json:"browser_type"`
}

// DefsStatus is returned to the frontend to show current state.
type DefsStatus struct {
	Version       int    `json:"version"`
	Updated       string `json:"updated"`
	Source        string `json:"source"`  // "builtin", "cached"
	SourceURL     string `json:"sourceUrl"`
	HasPrevious   bool   `json:"hasPrevious"`
	LastChecked   string `json:"lastChecked"`
}

// DefsUpdateResult is returned after checking for an update.
type DefsUpdateResult struct {
	Available   bool   `json:"available"`
	NewVersion  int    `json:"newVersion"`
	NewUpdated  string `json:"newUpdated"`
	NewNotes    string `json:"newNotes"`
	Error       string `json:"error,omitempty"`
}

// ─── File paths ───────────────────────────────────────────────────────────────

const defsRemoteURL = "https://raw.githubusercontent.com/getsetbro/linkright_repo/main/LinkRight/LinkRight/browser-defs.json"

func defsActivePath() string {
	return filepath.Join(configDir(), "browser-defs.active.json")
}

func defsPreviousPath() string {
	return filepath.Join(configDir(), "browser-defs.previous.json")
}

func defsLastCheckedPath() string {
	return filepath.Join(configDir(), "browser-defs.lastchecked")
}

// ─── Loading (3-layer fallback) ───────────────────────────────────────────────

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
		// Should never happen — embedded at compile time
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

// ─── Env expansion ────────────────────────────────────────────────────────────

// expandEnvPath replaces ${LOCALAPPDATA}, ${APPDATA} etc. in a path template.
func expandEnvPath(tmpl string) string {
	tmpl = strings.ReplaceAll(tmpl, "${LOCALAPPDATA}", os.Getenv("LOCALAPPDATA"))
	tmpl = strings.ReplaceAll(tmpl, "${APPDATA}", os.Getenv("APPDATA"))
	// Normalize to OS path separators
	return filepath.FromSlash(tmpl)
}

// ─── Helpers used by refactored browsers.go / launcher.go ─────────────────────

// DefsDetectBrowserType uses the loaded definitions to determine browser type.
func DefsDetectBrowserType(name, path string) string {
	defs := GetDefs()
	nameLower := strings.ToLower(name)
	pathLower := strings.ToLower(path)

	for _, rule := range defs.TypeDetRules {
		if rule.NameOrPathContains != "" {
			needle := strings.ToLower(rule.NameOrPathContains)
			if strings.Contains(nameLower, needle) || strings.Contains(pathLower, needle) {
				return rule.Type
			}
		}
		if rule.NameEquals != "" && nameLower == strings.ToLower(rule.NameEquals) {
			return rule.Type
		}
		if rule.PathEndsWith != "" {
			suffix := strings.ToLower(rule.PathEndsWith)
			if strings.HasSuffix(pathLower, suffix) {
				return rule.Type
			}
		}
	}
	return "other"
}

// DefsChromiumUserDataDir uses loaded definitions to resolve the user data dir.
func DefsChromiumUserDataDir(exePath string) string {
	defs := GetDefs()
	chromium, ok := defs.BrowserTypes["chromium"]
	if !ok {
		return ""
	}

	pathLower := strings.ToLower(exePath)

	// Walk channel detection rules in order (first match wins)
	for _, rule := range chromium.ChannelDetection {
		if strings.Contains(pathLower, strings.ToLower(rule.PathContains)) {
			if tmpl, ok := chromium.UserDataDirs[rule.DataDirKey]; ok {
				return expandEnvPath(tmpl)
			}
		}
	}
	return ""
}

// DefsFirefoxProfileDir uses loaded definitions to resolve the Firefox profile directory.
func DefsFirefoxProfileDir(exePath string) string {
	defs := GetDefs()
	ff, ok := defs.BrowserTypes["firefox"]
	if !ok {
		return ""
	}

	pathLower := strings.ToLower(exePath)

	isDevEdition := false
	for _, indicator := range ff.DevPathIndicators {
		if strings.Contains(pathLower, strings.ToLower(indicator)) {
			isDevEdition = true
			break
		}
	}

	if isDevEdition {
		if tmpl, ok := ff.ProfileDirs["developer"]; ok {
			devDir := expandEnvPath(tmpl)
			iniPath := filepath.Join(devDir, "profiles.ini")
			if _, err := os.Stat(iniPath); err == nil {
				return devDir
			}
		}
		return ""
	}

	// Standard Firefox
	if tmpl, ok := ff.ProfileDirs["standard"]; ok {
		stdDir := expandEnvPath(tmpl)
		iniPath := filepath.Join(stdDir, "profiles.ini")
		if _, err := os.Stat(iniPath); err == nil {
			return stdDir
		}
	}
	return ""
}

// DefsBuildLaunchArgs constructs command-line arguments from definitions.
func DefsBuildLaunchArgs(browserPath, profileID, url string) []string {
	defs := GetDefs()
	pathLower := strings.ToLower(browserPath)

	// Determine browser type
	browserType := ""
	for _, rule := range defs.TypeDetRules {
		if rule.NameOrPathContains != "" && strings.Contains(pathLower, strings.ToLower(rule.NameOrPathContains)) {
			browserType = rule.Type
			break
		}
		if rule.PathEndsWith != "" && strings.HasSuffix(pathLower, strings.ToLower(rule.PathEndsWith)) {
			browserType = rule.Type
			break
		}
	}

	typeDef, ok := defs.BrowserTypes[browserType]
	if !ok {
		// Unknown type — just pass the URL
		return []string{url}
	}

	// Firefox: resolve profile path
	if browserType == "firefox" {
		profilePath := firefoxProfilePath(browserPath, profileID)
		if profilePath != "" {
			return substituteFlags(typeDef.LaunchFlags, map[string]string{
				"${profilePath}": profilePath,
				"${profileId}":   profileID,
				"${url}":         url,
			})
		}
		return substituteFlags(typeDef.LaunchFlagsNoProfile, map[string]string{
			"${url}": url,
		})
	}

	// Chromium: use profile directory flag
	if profileID != "" && profileID != "Default" {
		if chromiumProfileExists(browserPath, profileID) {
			return substituteFlags(typeDef.LaunchFlags, map[string]string{
				"${profileId}": profileID,
				"${url}":       url,
			})
		}
	}
	return substituteFlags(typeDef.LaunchFlagsNoProfile, map[string]string{
		"${url}": url,
	})
}

// substituteFlags replaces known placeholders in flag templates.
// Only known placeholders are substituted — no arbitrary execution.
func substituteFlags(templates []string, vars map[string]string) []string {
	result := make([]string, 0, len(templates))
	for _, tmpl := range templates {
		val := tmpl
		for placeholder, replacement := range vars {
			val = strings.ReplaceAll(val, placeholder, replacement)
		}
		result = append(result, val)
	}
	return result
}

// DefsGetMSIXBrowsers returns the MSIX browser list from definitions.
func DefsGetMSIXBrowsers() []MSIXBrowserDef {
	return GetDefs().MSIXBrowsers
}

// ─── Status / Update methods (exposed to frontend via App) ────────────────────

// getDefsSource returns "cached" if an active file exists, otherwise "builtin".
func getDefsSource() string {
	if _, err := os.Stat(defsActivePath()); err == nil {
		return "cached"
	}
	return "builtin"
}

func getLastChecked() string {
	data, err := os.ReadFile(defsLastCheckedPath())
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func saveLastChecked() {
	_ = os.MkdirAll(configDir(), 0755)
	_ = os.WriteFile(defsLastCheckedPath(), []byte(time.Now().Format(time.RFC3339)), 0644)
}

// fetchRemoteDefs downloads and parses the remote definitions file.
func fetchRemoteDefs() (*BrowserDefs, error) {
	// Use net/http inline to avoid import at package level when not needed
	resp, err := httpGet(defsRemoteURL)
	if err != nil {
		return nil, fmt.Errorf("network error: %w", err)
	}

	var defs BrowserDefs
	if err := json.Unmarshal(resp, &defs); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}
	if defs.SchemaVersion < 1 {
		return nil, fmt.Errorf("invalid schema_version")
	}
	return &defs, nil
}

// applyDefsUpdate moves active → previous, writes new defs as active, reloads.
func applyDefsUpdate(newDefs *BrowserDefs) error {
	dir := configDir()
	_ = os.MkdirAll(dir, 0755)

	// Move current active → previous (if active exists)
	activePath := defsActivePath()
	if _, err := os.Stat(activePath); err == nil {
		_ = os.Remove(defsPreviousPath())
		_ = os.Rename(activePath, defsPreviousPath())
	}

	// Write new active
	data, err := json.MarshalIndent(newDefs, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(activePath, data, 0644); err != nil {
		return err
	}

	// Reload in memory
	activeDefs = newDefs
	return nil
}

// revertDefs swaps previous back into active and reloads.
func revertDefs() error {
	prevPath := defsPreviousPath()
	if _, err := os.Stat(prevPath); os.IsNotExist(err) {
		return fmt.Errorf("no previous version to revert to")
	}

	activePath := defsActivePath()
	_ = os.Remove(activePath)
	if err := os.Rename(prevPath, activePath); err != nil {
		return err
	}

	// Reload
	LoadActiveDefs()
	return nil
}

// resetDefsToBuiltin removes cached files and reverts to embedded baseline.
func resetDefsToBuiltin() {
	_ = os.Remove(defsActivePath())
	_ = os.Remove(defsPreviousPath())
	activeDefs = loadEmbeddedDefs()
}
