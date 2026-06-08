package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

// startupShortcutPath returns the path to the Windows Startup folder shortcut.
func startupShortcutPath() string {
	appData := os.Getenv("APPDATA")
	return filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "LinkRight (Tray).lnk")
}

// IsStartupEnabled returns true if the tray startup shortcut exists.
func IsStartupEnabled() bool {
	_, err := os.Stat(startupShortcutPath())
	return err == nil
}

// EnableStartup creates a Windows shortcut in the Startup folder that launches
// LinkRight.exe with the --tray flag. Uses PowerShell to create the .lnk file.
func EnableStartup() error {
	exePath := GetExePath()
	if exePath == "" {
		return nil
	}

	shortcutPath := startupShortcutPath()

	// PowerShell script to create a .lnk shortcut
	script := `$ws = New-Object -ComObject WScript.Shell; ` +
		`$s = $ws.CreateShortcut('` + shortcutPath + `'); ` +
		`$s.TargetPath = '` + exePath + `'; ` +
		`$s.Arguments = '--tray'; ` +
		`$s.WorkingDirectory = '` + filepath.Dir(exePath) + `'; ` +
		`$s.Description = 'Link Right system tray'; ` +
		`$s.Save()`

	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Run()
}

// DisableStartup removes the tray startup shortcut from the Startup folder.
func DisableStartup() error {
	path := startupShortcutPath()
	err := os.Remove(path)
	if os.IsNotExist(err) {
		return nil // already gone — not an error
	}
	return err
}
