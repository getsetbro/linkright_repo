package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

// LaunchBrowser opens the given URL in the specified browser with the given profile.
// profileID is the profile directory name (e.g. "Profile 1", "Default") for Chromium.
// Only Chromium-based browsers support profiles; non-Chromium browsers ignore the
// profileID and are launched with just the URL.
// If the specified profile no longer exists, the browser is launched without a
// profile argument (graceful fallback).
func LaunchBrowser(browserPath, profileID, url string) error {
	if browserPath == "" {
		return fmt.Errorf("no browser path specified")
	}

	args := buildLaunchArgs(browserPath, profileID, url)

	// MSIX App Execution Aliases (stubs in WindowsApps) do not reliably
	// forward command-line arguments when invoked directly via exec.Command.
	// Use ShellExecuteW which correctly launches MSIX-packaged apps like Arc
	// and passes the URL/arguments through to the application.
	if isMSIXPath(browserPath) {
		return shellExecuteOpen(browserPath, strings.Join(args, " "))
	}

	cmd := exec.Command(browserPath, args...)
	hideWindow(cmd)
	return cmd.Start()
}

// isMSIXPath returns true if the browser path is an MSIX App Execution Alias
// (located under %LOCALAPPDATA%\Microsoft\WindowsApps).
func isMSIXPath(browserPath string) bool {
	return strings.Contains(strings.ToLower(browserPath), `\microsoft\windowsapps\`)
}

// shellExecuteOpen launches a program with parameters using the Windows
// ShellExecuteW API. This is the correct way to launch MSIX app execution
// aliases because CreateProcess (used by exec.Command) does not reliably
// pass arguments through MSIX alias stubs.
func shellExecuteOpen(exePath, params string) error {
	verb, _ := syscall.UTF16PtrFromString("open")
	file, _ := syscall.UTF16PtrFromString(exePath)
	var paramsPtr *uint16
	if params != "" {
		paramsPtr, _ = syscall.UTF16PtrFromString(params)
	}

	ret, _, _ := procShellExecute.Call(
		0,
		uintptr(unsafe.Pointer(verb)),
		uintptr(unsafe.Pointer(file)),
		uintptr(unsafe.Pointer(paramsPtr)),
		0,
		0, // SW_HIDE — no extra window
	)
	if ret <= 32 {
		return fmt.Errorf("ShellExecuteW failed with code %d", ret)
	}
	return nil
}

// buildLaunchArgs constructs the command-line arguments for launching a browser.
// Delegates to DefsBuildLaunchArgs which reads flag templates from the browser
// definitions file, substituting only known placeholders.
func buildLaunchArgs(browserPath, profileID, url string) []string {
	return DefsBuildLaunchArgs(browserPath, profileID, url)
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
