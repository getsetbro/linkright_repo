package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows/registry"
)

// DetectBrowsers scans the Windows registry and filesystem for installed browsers
func DetectBrowsers() []Browser {
	var browsers []Browser

	// Scan HKLM StartMenuInternet
	browsers = append(browsers, scanStartMenuInternet(registry.LOCAL_MACHINE)...)
	// Scan HKCU StartMenuInternet (user-installed browsers)
	browsers = append(browsers, scanStartMenuInternet(registry.CURRENT_USER)...)

	// Deduplicate by path
	seen := map[string]bool{}
	var unique []Browser
	for _, b := range browsers {
		key := strings.ToLower(b.Path)
		if !seen[key] && b.Path != "" {
			seen[key] = true
			// Detect profiles
			b.Profiles = detectProfiles(b)
			if len(b.Profiles) == 0 {
				b.Profiles = []BrowserProfile{{ID: "Default", Name: "Default"}}
			}
			unique = append(unique, b)
		}
	}

	return unique
}

func scanStartMenuInternet(root registry.Key) []Browser {
	var browsers []Browser

	k, err := registry.OpenKey(root, `SOFTWARE\Clients\StartMenuInternet`, registry.READ|registry.ENUMERATE_SUB_KEYS)
	if err != nil {
		return browsers
	}
	defer k.Close()

	names, err := k.ReadSubKeyNames(-1)
	if err != nil {
		return browsers
	}

	for _, name := range names {
		subKey, err := registry.OpenKey(root, `SOFTWARE\Clients\StartMenuInternet\`+name, registry.READ)
		if err != nil {
			continue
		}

		displayName, _, _ := subKey.GetStringValue("")
		if displayName == "" {
			displayName = name
		}

		// Get executable path
		cmdKey, err := registry.OpenKey(root, `SOFTWARE\Clients\StartMenuInternet\`+name+`\shell\open\command`, registry.READ)
		if err != nil {
			subKey.Close()
			continue
		}
		cmdVal, _, _ := cmdKey.GetStringValue("")
		cmdKey.Close()
		subKey.Close()

		exePath := extractExePath(cmdVal)
		if exePath == "" {
			continue
		}

		// Check if the exe actually exists
		if _, err := os.Stat(exePath); os.IsNotExist(err) {
			continue
		}

		browserType := detectBrowserType(name, exePath)

		browsers = append(browsers, Browser{
			Name: displayName,
			Path: exePath,
			Type: browserType,
		})
	}

	return browsers
}

// extractExePath pulls the executable path out of a registry command string
// e.g. `"C:\Program Files\Google\Chrome\Application\chrome.exe" -- "%1"` -> `C:\Program Files\Google\Chrome\Application\chrome.exe`
func extractExePath(cmd string) string {
	cmd = strings.TrimSpace(cmd)
	if cmd == "" {
		return ""
	}
	if cmd[0] == '"' {
		end := strings.Index(cmd[1:], `"`)
		if end >= 0 {
			return cmd[1 : end+1]
		}
	}
	// No quotes — take up to first space
	parts := strings.SplitN(cmd, " ", 2)
	return parts[0]
}

func detectBrowserType(name, path string) string {
	nameLower := strings.ToLower(name)
	pathLower := strings.ToLower(path)

	if strings.Contains(nameLower, "firefox") || strings.Contains(pathLower, "firefox") {
		return "firefox"
	}
	if strings.Contains(nameLower, "chrome") || strings.Contains(pathLower, "chrome") ||
		strings.Contains(nameLower, "edge") || strings.Contains(pathLower, "edge") ||
		strings.Contains(nameLower, "brave") || strings.Contains(pathLower, "brave") ||
		strings.Contains(nameLower, "opera") || strings.Contains(pathLower, "opera") ||
		strings.Contains(nameLower, "vivaldi") || strings.Contains(pathLower, "vivaldi") {
		return "chromium"
	}
	return "other"
}

// detectProfiles finds browser profiles for a given browser
func detectProfiles(b Browser) []BrowserProfile {
	switch b.Type {
	case "chromium":
		return detectChromiumProfiles(b.Path)
	case "firefox":
		return detectFirefoxProfiles()
	}
	return nil
}

// detectChromiumProfiles finds profiles for Chromium-based browsers
func detectChromiumProfiles(exePath string) []BrowserProfile {
	// Determine user data dir based on exe path
	userDataDir := chromiumUserDataDir(exePath)
	if userDataDir == "" {
		return nil
	}

	if _, err := os.Stat(userDataDir); os.IsNotExist(err) {
		return nil
	}

	var profiles []BrowserProfile

	entries, err := os.ReadDir(userDataDir)
	if err != nil {
		return nil
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dirName := entry.Name()
		if dirName != "Default" && !strings.HasPrefix(dirName, "Profile ") {
			continue
		}

		// Read friendly name from Preferences file
		prefPath := filepath.Join(userDataDir, dirName, "Preferences")
		friendlyName := dirName
		if data, err := os.ReadFile(prefPath); err == nil {
			var prefs map[string]interface{}
			if json.Unmarshal(data, &prefs) == nil {
				if profile, ok := prefs["profile"].(map[string]interface{}); ok {
					if name, ok := profile["name"].(string); ok && name != "" {
						friendlyName = name
					}
				}
			}
		}

		profiles = append(profiles, BrowserProfile{
			ID:   dirName,
			Name: friendlyName,
		})
	}

	return profiles
}

// chromiumUserDataDir returns the user data directory for a Chromium-based browser
func chromiumUserDataDir(exePath string) string {
	pathLower := strings.ToLower(exePath)
	localAppData := os.Getenv("LOCALAPPDATA")

	if strings.Contains(pathLower, "chrome") {
		return filepath.Join(localAppData, "Google", "Chrome", "User Data")
	}
	if strings.Contains(pathLower, "msedge") || strings.Contains(pathLower, "edge") {
		return filepath.Join(localAppData, "Microsoft", "Edge", "User Data")
	}
	if strings.Contains(pathLower, "brave") {
		return filepath.Join(localAppData, "BraveSoftware", "Brave-Browser", "User Data")
	}
	if strings.Contains(pathLower, "opera") {
		return filepath.Join(localAppData, "Opera Software", "Opera Stable")
	}
	if strings.Contains(pathLower, "vivaldi") {
		return filepath.Join(localAppData, "Vivaldi", "User Data")
	}
	return ""
}

// detectFirefoxProfiles reads Firefox profiles from profiles.ini
func detectFirefoxProfiles() []BrowserProfile {
	appData := os.Getenv("APPDATA")
	profilesDir := filepath.Join(appData, "Mozilla", "Firefox", "Profiles")
	iniPath := filepath.Join(appData, "Mozilla", "Firefox", "profiles.ini")

	var profiles []BrowserProfile

	// Parse profiles.ini
	data, err := os.ReadFile(iniPath)
	if err != nil {
		// Fall back to scanning the profiles directory
		entries, err := os.ReadDir(profilesDir)
		if err != nil {
			return nil
		}
		for _, entry := range entries {
			if entry.IsDir() {
				name := entry.Name()
				// Firefox profile dirs are like "xxxxxxxx.default" or "xxxxxxxx.default-release"
				if idx := strings.LastIndex(name, "."); idx >= 0 {
					profiles = append(profiles, BrowserProfile{
						ID:   name,
						Name: name[idx+1:],
					})
				}
			}
		}
		return profiles
	}

	// Parse INI file
	lines := strings.Split(string(data), "\n")
	var currentName, currentPath string
	inProfile := false

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "[Profile") {
			if inProfile && currentPath != "" {
				profiles = append(profiles, BrowserProfile{
					ID:   currentPath,
					Name: currentName,
				})
			}
			currentName = ""
			currentPath = ""
			inProfile = true
		} else if line == "[General]" || strings.HasPrefix(line, "[Install") {
			if inProfile && currentPath != "" {
				profiles = append(profiles, BrowserProfile{
					ID:   currentPath,
					Name: currentName,
				})
			}
			inProfile = false
		} else if inProfile {
			if strings.HasPrefix(line, "Name=") {
				currentName = strings.TrimPrefix(line, "Name=")
			} else if strings.HasPrefix(line, "Path=") {
				p := strings.TrimPrefix(line, "Path=")
				// Get just the last segment as the profile ID
				parts := strings.Split(p, "/")
				currentPath = parts[len(parts)-1]
				if currentName == "" {
					currentName = currentPath
				}
			}
		}
	}
	if inProfile && currentPath != "" {
		profiles = append(profiles, BrowserProfile{
			ID:   currentPath,
			Name: currentName,
		})
	}

	return profiles
}
