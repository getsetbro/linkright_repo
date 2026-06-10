package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// LaunchBrowser opens the given URL in the specified browser with the given profile.
// profileID is the profile directory name (e.g. "Profile 1", "Default") for Chromium,
// or the profile directory name (e.g. "xxxxxxxx.default-release") for Firefox.
// Firefox uses --profile with the full path to avoid triggering the profile chooser.
// If the specified profile no longer exists, the browser is launched without a
// profile argument (graceful fallback).
func LaunchBrowser(browserPath, profileID, url string) error {
	if browserPath == "" {
		return fmt.Errorf("no browser path specified")
	}

	args := buildLaunchArgs(browserPath, profileID, url)
	cmd := exec.Command(browserPath, args...)
	hideWindow(cmd)
	return cmd.Start()
}

// buildLaunchArgs constructs the command-line arguments for launching a browser.
// Delegates to DefsBuildLaunchArgs which reads flag templates from the browser
// definitions file, substituting only known placeholders.
func buildLaunchArgs(browserPath, profileID, url string) []string {
	return DefsBuildLaunchArgs(browserPath, profileID, url)
}

// firefoxProfilePath resolves a Firefox profile ID (directory name like
// "xxxxxxxx.default-release") to its full filesystem path.
// It checks both the standard Firefox and Firefox Developer Edition profile
// directories based on the browser's executable path.
// Returns "" if the profile doesn't exist (triggering graceful fallback).
func firefoxProfilePath(browserPath, profileID string) string {
	if profileID == "" {
		return ""
	}

	appData := os.Getenv("APPDATA")
	if appData == "" {
		return ""
	}

	// Determine which Firefox variant this is based on the exe path
	pathLower := strings.ToLower(browserPath)
	isDevEdition := strings.Contains(pathLower, "developer edition") ||
		strings.Contains(pathLower, "firefox dev")

	// Try the variant-specific profiles directory first
	var profilesDirs []string
	if isDevEdition {
		profilesDirs = append(profilesDirs, filepath.Join(appData, "Mozilla", "Firefox Developer Edition", "Profiles"))
	}
	// Always check the standard Firefox profiles dir as a fallback
	profilesDirs = append(profilesDirs, filepath.Join(appData, "Mozilla", "Firefox", "Profiles"))

	for _, profilesDir := range profilesDirs {
		fullPath := filepath.Join(profilesDir, profileID)
		if info, err := os.Stat(fullPath); err == nil && info.IsDir() {
			return fullPath
		}
	}

	// The profileID might already be a full path (unlikely but handle gracefully)
	if filepath.IsAbs(profileID) {
		if info, err := os.Stat(profileID); err == nil && info.IsDir() {
			return profileID
		}
	}

	// Profile not found — return empty to trigger fallback (launch without profile)
	return ""
}

// chromiumProfileExists checks whether a Chromium profile directory exists on disk.
// This is used as a fallback guard: if a user deletes a profile but the rule still
// references it, we gracefully skip the --profile-directory flag.
func chromiumProfileExists(browserPath, profileID string) bool {
	userDataDir := chromiumUserDataDir(browserPath)
	if userDataDir == "" {
		// Can't determine user data dir — assume profile exists to preserve behavior
		return true
	}
	profileDir := filepath.Join(userDataDir, profileID)
	info, err := os.Stat(profileDir)
	return err == nil && info.IsDir()
}
