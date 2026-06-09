package main

import (
	"fmt"
	"os/exec"
	"strings"
)

// LaunchBrowser opens the given URL in the specified browser with the given profile.
// profileID is the profile directory name (e.g. "Profile 1", "Default") for Chromium,
// or the profile name for Firefox (-P flag).
// Full implementation is Phase 6; this stub is wired up for the chooser flow.
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
func buildLaunchArgs(browserPath, profileID, url string) []string {
	pathLower := strings.ToLower(browserPath)

	// Firefox: use -P "ProfileName" -no-remote flags.
	// -no-remote prevents Firefox from connecting to an already-running instance,
	// which would otherwise trigger the "Choose User Profile" modal.
	if strings.Contains(pathLower, "firefox") {
		profile := profileID
		if profile == "" {
			profile = "Default"
		}
		return []string{"-P", profile, "-no-remote", url}
	}

	// Chromium-based: use --profile-directory="Profile 1" flag
	if profileID != "" && profileID != "Default" {
		return []string{"--profile-directory=" + profileID, url}
	}
	return []string{url}
}
