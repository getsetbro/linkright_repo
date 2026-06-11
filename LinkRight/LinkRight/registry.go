package main

import (
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows/registry"
)

const (
	appName        = "LinkRight"
	appDisplayName = "Link Right"
	appDescription = "You link me right route, route, route"
	urlClassName   = "LinkRightURL"
)

// RegisterApp registers Link Right as a browser in HKCU (no admin required)
func RegisterApp() error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}
	exePath, err = filepath.Abs(exePath)
	if err != nil {
		return err
	}

	cmdValue := `"` + exePath + `" "%1"`

	// 1. Register StartMenuInternet entry
	base := `SOFTWARE\Clients\StartMenuInternet\` + appName

	if err := setRegValue(registry.CURRENT_USER, base, "", appDisplayName); err != nil {
		return err
	}

	// Capabilities
	caps := base + `\Capabilities`
	if err := setRegValue(registry.CURRENT_USER, caps, "ApplicationName", appDisplayName); err != nil {
		return err
	}
	if err := setRegValue(registry.CURRENT_USER, caps, "ApplicationDescription", appDescription); err != nil {
		return err
	}

	// URL Associations
	urlAssoc := caps + `\URLAssociations`
	if err := setRegValue(registry.CURRENT_USER, urlAssoc, "http", urlClassName); err != nil {
		return err
	}
	if err := setRegValue(registry.CURRENT_USER, urlAssoc, "https", urlClassName); err != nil {
		return err
	}

	// Open command
	openCmd := base + `\shell\open\command`
	if err := setRegValue(registry.CURRENT_USER, openCmd, "", cmdValue); err != nil {
		return err
	}

	// Default icon
	iconPath := base + `\DefaultIcon`
	if err := setRegValue(registry.CURRENT_USER, iconPath, "", exePath+",0"); err != nil {
		return err
	}

	// 2. Register URL handler class
	classBase := `SOFTWARE\Classes\` + urlClassName
	if err := setRegValue(registry.CURRENT_USER, classBase, "", appDisplayName+" URL"); err != nil {
		return err
	}
	if err := setRegValue(registry.CURRENT_USER, classBase, "URL Protocol", ""); err != nil {
		return err
	}

	classCmd := classBase + `\shell\open\command`
	if err := setRegValue(registry.CURRENT_USER, classCmd, "", cmdValue); err != nil {
		return err
	}

	classIcon := classBase + `\DefaultIcon`
	if err := setRegValue(registry.CURRENT_USER, classIcon, "", exePath+",0"); err != nil {
		return err
	}

	// 3. Register with RegisteredApplications
	if err := setRegValue(registry.CURRENT_USER, `SOFTWARE\RegisteredApplications`, appName,
		`SOFTWARE\Clients\StartMenuInternet\`+appName+`\Capabilities`); err != nil {
		return err
	}

	return nil
}

// UnregisterApp removes all Link Right registry entries
func UnregisterApp() error {
	// Remove StartMenuInternet entry (recursive delete handles any subkeys)
	deleteRegKeyTree(registry.CURRENT_USER, `SOFTWARE\Clients\StartMenuInternet\`+appName)

	// Remove URL class
	deleteRegKeyTree(registry.CURRENT_USER, `SOFTWARE\Classes\`+urlClassName)

	// Remove from RegisteredApplications
	k, err := registry.OpenKey(registry.CURRENT_USER, `SOFTWARE\RegisteredApplications`, registry.SET_VALUE)
	if err == nil {
		k.DeleteValue(appName)
		k.Close()
	}

	return nil
}

// IsRegistered checks if Link Right is registered as a browser
func IsRegistered() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER,
		`SOFTWARE\Clients\StartMenuInternet\`+appName+`\shell\open\command`,
		registry.READ)
	if err != nil {
		return false
	}
	k.Close()
	return true
}

// IsDefaultBrowser checks if Link Right is currently set as the Windows default browser
// for http and https by reading the user's ProgId associations.
func IsDefaultBrowser() bool {
	// Check HKCU\SOFTWARE\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice
	for _, scheme := range []string{"http", "https"} {
		keyPath := `SOFTWARE\Microsoft\Windows\Shell\Associations\UrlAssociations\` + scheme + `\UserChoice`
		k, err := registry.OpenKey(registry.CURRENT_USER, keyPath, registry.READ)
		if err != nil {
			return false
		}
		progID, _, err := k.GetStringValue("ProgId")
		k.Close()
		if err != nil {
			return false
		}
		if !strings.EqualFold(progID, urlClassName) {
			return false
		}
	}
	return true
}

// shellExecute is a lazily-loaded reference to Shell32's ShellExecuteW.
var (
	modShell32       = syscall.NewLazyDLL("shell32.dll")
	procShellExecute = modShell32.NewProc("ShellExecuteW")
)

// OpenDefaultAppsSettings opens the Windows Default Apps settings page
// using ShellExecuteW so no console window is ever created.
func OpenDefaultAppsSettings() error {
	verb, _ := syscall.UTF16PtrFromString("open")
	uri, _ := syscall.UTF16PtrFromString("ms-settings:defaultapps")
	ret, _, _ := procShellExecute.Call(
		0,
		uintptr(unsafe.Pointer(verb)),
		uintptr(unsafe.Pointer(uri)),
		0,
		0,
		1, // SW_SHOWNORMAL
	)
	// ShellExecuteW returns a value > 32 on success
	if ret <= 32 {
		return syscall.EINVAL
	}
	return nil
}

// setRegValue creates or updates a registry string value
func setRegValue(root registry.Key, keyPath, valueName, value string) error {
	k, _, err := registry.CreateKey(root, keyPath, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()
	return k.SetStringValue(valueName, value)
}

// GetExePath returns the absolute path to the current executable
func GetExePath() string {
	exePath, err := os.Executable()
	if err != nil {
		return ""
	}
	abs, err := filepath.Abs(exePath)
	if err != nil {
		return exePath
	}
	return abs
}
