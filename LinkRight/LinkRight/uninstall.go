package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

var (
	user32          = syscall.NewLazyDLL("user32.dll")
	procMessageBoxW = user32.NewProc("MessageBoxW")
)

const (
	mbOK              = 0x00000000
	mbOKCancel        = 0x00000001
	mbIconQuestion    = 0x00000020
	mbIconInformation = 0x00000040
	mbIconWarning     = 0x00000030
	idOK              = 1
)

// messageBox shows a Windows native message box and returns the button ID pressed.
func messageBox(title, text string, flags uint32) int32 {
	titlePtr, _ := windows.UTF16PtrFromString(title)
	textPtr, _ := windows.UTF16PtrFromString(text)
	ret, _, _ := procMessageBoxW.Call(
		0,
		uintptr(unsafe.Pointer(textPtr)),
		uintptr(unsafe.Pointer(titlePtr)),
		uintptr(flags),
	)
	return int32(ret)
}

// RunUninstall performs the full uninstall flow silently (no dialogs):
//  1. Close any running Link Right settings/picker windows
//  2. Remove all registry entries
//  3. Delete %APPDATA%\LinkRight\ directory
//  4. Remove Start Menu shortcuts
//
// This is called by the Inno Setup uninstaller which already shows its own
// confirmation dialog, so no additional prompts are needed.
func RunUninstall() {
	// Close any running Link Right instances before cleaning up.
	// We use taskkill to terminate all LinkRight.exe processes except the
	// current one (the --uninstall invocation itself).
	closeRunningInstances()

	// Silently clean up registry entries, config directory, and shortcuts.
	// Errors are intentionally ignored — best-effort cleanup.
	_ = uninstallRegistry()
	_ = uninstallConfigDir()
	uninstallShortcuts()
}

// closeRunningInstances terminates any running LinkRight.exe processes that
// are not the current uninstall process. Uses taskkill /F /FI to filter by
// image name while excluding the current PID.
func closeRunningInstances() {
	currentPID := os.Getpid()

	// taskkill /F /IM LinkRight.exe /FI "PID ne <currentPID>"
	// This forcefully kills all LinkRight.exe processes except this one.
	cmd := exec.Command("taskkill", "/F", "/IM", "LinkRight.exe",
		"/FI", "PID ne "+itoa(currentPID))
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Run() // ignore errors — process may not be running
}

// itoa converts an int to its decimal string representation without importing strconv.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	buf := make([]byte, 0, 20)
	for n > 0 {
		buf = append([]byte{byte('0' + n%10)}, buf...)
		n /= 10
	}
	if neg {
		buf = append([]byte{'-'}, buf...)
	}
	return string(buf)
}

// uninstallRegistry removes all HKCU registry entries written by Link Right.
func uninstallRegistry() error {
	// Remove StartMenuInternet tree
	deleteRegKeyTree(registry.CURRENT_USER, `SOFTWARE\Clients\StartMenuInternet\`+appName+`\Capabilities\URLAssociations`)
	deleteRegKeyTree(registry.CURRENT_USER, `SOFTWARE\Clients\StartMenuInternet\`+appName+`\Capabilities`)
	deleteRegKeyTree(registry.CURRENT_USER, `SOFTWARE\Clients\StartMenuInternet\`+appName+`\shell\open\command`)
	deleteRegKeyTree(registry.CURRENT_USER, `SOFTWARE\Clients\StartMenuInternet\`+appName+`\shell\open`)
	deleteRegKeyTree(registry.CURRENT_USER, `SOFTWARE\Clients\StartMenuInternet\`+appName+`\shell`)
	deleteRegKeyTree(registry.CURRENT_USER, `SOFTWARE\Clients\StartMenuInternet\`+appName+`\DefaultIcon`)
	deleteRegKeyTree(registry.CURRENT_USER, `SOFTWARE\Clients\StartMenuInternet\`+appName)

	// Remove URL handler class tree
	deleteRegKeyTree(registry.CURRENT_USER, `SOFTWARE\Classes\`+urlClassName+`\shell\open\command`)
	deleteRegKeyTree(registry.CURRENT_USER, `SOFTWARE\Classes\`+urlClassName+`\shell\open`)
	deleteRegKeyTree(registry.CURRENT_USER, `SOFTWARE\Classes\`+urlClassName+`\shell`)
	deleteRegKeyTree(registry.CURRENT_USER, `SOFTWARE\Classes\`+urlClassName+`\DefaultIcon`)
	deleteRegKeyTree(registry.CURRENT_USER, `SOFTWARE\Classes\`+urlClassName)

	// Remove from RegisteredApplications
	k, err := registry.OpenKey(registry.CURRENT_USER, `SOFTWARE\RegisteredApplications`, registry.SET_VALUE)
	if err == nil {
		_ = k.DeleteValue(appName)
		k.Close()
	}

	// Note: Windows 10/11 protects UserChoice keys for http/https and does not
	// allow them to be deleted programmatically. The user will need to reassign
	// their default browser via Windows Settings > Apps > Default Apps.

	return nil
}

// uninstallConfigDir deletes the %APPDATA%\LinkRight\ directory and all its contents.
func uninstallConfigDir() error {
	dir := configDir()
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return nil // already gone
	}
	return os.RemoveAll(dir)
}

// uninstallShortcuts removes any Start Menu shortcuts created by Link Right.
func uninstallShortcuts() {
	// Check common Start Menu locations
	appData := os.Getenv("APPDATA")
	programsDir := filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs")

	candidates := []string{
		filepath.Join(programsDir, "Link Right.lnk"),
		filepath.Join(programsDir, "LinkRight.lnk"),
		filepath.Join(programsDir, "Link Right", "Link Right.lnk"),
		filepath.Join(programsDir, "Link Right", "Uninstall Link Right.lnk"),
	}

	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			_ = os.Remove(path)
		}
	}

	// Remove the folder if it's now empty
	linkRightDir := filepath.Join(programsDir, "Link Right")
	if entries, err := os.ReadDir(linkRightDir); err == nil && len(entries) == 0 {
		_ = os.Remove(linkRightDir)
	}
}

// deleteRegKeyTree deletes a registry key, ignoring errors (key may not exist).
func deleteRegKeyTree(root registry.Key, keyPath string) {
	_ = registry.DeleteKey(root, keyPath)
}
