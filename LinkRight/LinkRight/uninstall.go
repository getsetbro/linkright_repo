package main

import (
	"os"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
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

// RunUninstall performs the full uninstall flow:
//  1. Confirm with the user
//  2. Remove all registry entries
//  3. Delete %APPDATA%\LinkRight\ directory
//  4. Remove Start Menu shortcuts
//  5. Show completion message
func RunUninstall() {
	const appTitle = "Link Right Uninstaller"

	// Step 1: Confirm
	result := messageBox(
		appTitle,
		"This will completely remove Link Right from your user account.\n\n"+
			"• All registry entries will be deleted\n"+
			"• Your rules and settings will be deleted\n"+
			"• Start Menu shortcuts will be removed\n\n"+
			"Are you sure you want to uninstall Link Right?",
		mbOKCancel|mbIconQuestion,
	)
	if result != idOK {
		// User cancelled
		return
	}

	var errors []string

	// Step 2: Remove registry entries
	if err := uninstallRegistry(); err != nil {
		errors = append(errors, "Registry cleanup: "+err.Error())
	}

	// Step 3: Delete %APPDATA%\LinkRight\ directory
	if err := uninstallConfigDir(); err != nil {
		errors = append(errors, "Config directory: "+err.Error())
	}

	// Step 4: Remove Start Menu shortcuts
	uninstallShortcuts()

	// Step 5: Show result
	if len(errors) > 0 {
		msg := "Link Right has been mostly uninstalled, but some items could not be removed:\n\n"
		for _, e := range errors {
			msg += "• " + e + "\n"
		}
		msg += "\nYou may need to remove these manually."
		messageBox(appTitle, msg, mbOKCancel|mbIconWarning)
	} else {
		messageBox(
			appTitle,
			"Link Right has been successfully uninstalled.\n\n"+
				"Your PC has been restored to its previous state.\n"+
				"You can now delete LinkRight.exe.",
			mbOK|mbIconInformation,
		)
	}
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

	// Remove any UserChoice entries that point to LinkRight (best-effort)
	for _, scheme := range []string{"http", "https"} {
		keyPath := `SOFTWARE\Microsoft\Windows\Shell\Associations\UrlAssociations\` + scheme + `\UserChoice`
		k2, err2 := registry.OpenKey(registry.CURRENT_USER, keyPath, registry.READ)
		if err2 == nil {
			progID, _, _ := k2.GetStringValue("ProgId")
			k2.Close()
			// Only clear if it's still pointing at us — Windows protects this key,
			// so we attempt but don't fail if it can't be changed.
			if progID == urlClassName {
				// Windows 10/11 protects UserChoice; we can't reliably delete it,
				// but we can open Default Apps for the user to reassign manually.
				_ = OpenDefaultAppsSettings()
			}
		}
	}

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
