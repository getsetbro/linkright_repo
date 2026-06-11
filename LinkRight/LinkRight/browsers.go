package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
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
	// Scan for MSIX/AppX browsers (e.g. Arc, DuckDuckGo) that don't register in StartMenuInternet
	browsers = append(browsers, scanMSIXBrowsers()...)

	// Deduplicate by path, and exclude LinkRight itself to prevent endless loops
	seen := map[string]bool{}
	var unique []Browser
	exeSelf := strings.ToLower(GetExePath())
	for _, b := range browsers {
		key := strings.ToLower(b.Path)
		nameLower := strings.ToLower(b.Name)
		// Exclude LinkRight by exe path OR by display name to prevent routing loops
		if nameLower == "link right" || nameLower == "linkright" {
			continue
		}
		// Mark browsers in the unsupported list as unsupported (but still include them)
		if IsUnsupportedBrowser(b.Name, b.Path) {
			b.Unsupported = true
			b.UnsupportedReason = "This browser is not supported by Link Right and cannot be used for routing."
		}
		if !seen[key] && b.Path != "" && key != exeSelf {
			seen[key] = true
			// Detect profiles (skip for unsupported browsers)
			if !b.Unsupported {
				b.Profiles = detectProfiles(b)
				if len(b.Profiles) == 0 {
					b.Profiles = []BrowserProfile{{ID: "Default", Name: "Default"}}
				}
			}
			unique = append(unique, b)
		}
	}

	sort.Slice(unique, func(i, j int) bool {
		return strings.ToLower(unique[i].Name) < strings.ToLower(unique[j].Name)
	})

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
		// No closing quote — strip the leading quote and try the whole string
		// trimmed of any trailing arguments after common separators.
		return ""
	}
	// No quotes — take up to first space
	parts := strings.SplitN(cmd, " ", 2)
	candidate := parts[0]

	// If the simple split yields a valid file, use it directly.
	if _, err := os.Stat(candidate); err == nil {
		return candidate
	}

	// Otherwise, the path likely contains spaces (e.g. C:\Program Files\...\app.exe %1).
	// Progressively extend the path by consuming space-separated tokens until we
	// find a valid .exe file or run out of tokens.
	if len(parts) == 2 {
		tokens := strings.Split(parts[1], " ")
		accumulated := candidate
		for _, tok := range tokens {
			accumulated += " " + tok
			if strings.HasSuffix(strings.ToLower(accumulated), ".exe") {
				if _, err := os.Stat(accumulated); err == nil {
					return accumulated
				}
			}
		}
	}

	// Return the first token as a fallback (may still work if it's on PATH)
	return candidate
}

func detectBrowserType(name, path string) string {
	return DefsDetectBrowserType(name, path)
}

// detectProfiles finds browser profiles for a given browser.
// Only Chromium-based browsers support profiles; all others return nil.
func detectProfiles(b Browser) []BrowserProfile {
	if b.Type != "chromium" {
		return nil
	}
	return detectChromiumProfiles(b.Path)
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

	// First, try to read profile names from "Local State" which has the
	// authoritative info_cache with real profile names (the per-profile
	// Preferences file often just says "Your Chrome" or "Person 1").
	infoCache := readLocalStateInfoCache(userDataDir)

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

		friendlyName := dirName

		// Prefer the name from Local State info_cache (most accurate)
		if cached, ok := infoCache[dirName]; ok && cached != "" {
			friendlyName = cached
		} else {
			// Fall back to reading from Preferences file
			prefPath := filepath.Join(userDataDir, dirName, "Preferences")
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
		}

		profiles = append(profiles, BrowserProfile{
			ID:   dirName,
			Name: friendlyName,
		})
	}

	return profiles
}

// readLocalStateInfoCache reads the "Local State" file in a Chromium user data
// directory and returns a map of profile directory name -> display name from
// the profile.info_cache section. This is the authoritative source for profile
// names (the per-profile Preferences file often contains generic names like
// "Your Chrome" or "Person 1").
func readLocalStateInfoCache(userDataDir string) map[string]string {
	result := make(map[string]string)

	localStatePath := filepath.Join(userDataDir, "Local State")
	data, err := os.ReadFile(localStatePath)
	if err != nil {
		return result
	}

	var state map[string]interface{}
	if json.Unmarshal(data, &state) != nil {
		return result
	}

	profileSection, ok := state["profile"].(map[string]interface{})
	if !ok {
		return result
	}

	infoCache, ok := profileSection["info_cache"].(map[string]interface{})
	if !ok {
		return result
	}

	for profileDir, info := range infoCache {
		infoMap, ok := info.(map[string]interface{})
		if !ok {
			continue
		}
		// Prefer "name" field which is the user-visible profile name
		if name, ok := infoMap["name"].(string); ok && name != "" {
			result[profileDir] = name
		}
	}

	return result
}

// chromiumUserDataDir returns the user data directory for a Chromium-based browser
func chromiumUserDataDir(exePath string) string {
	pathLower := strings.ToLower(exePath)
	localAppData := os.Getenv("LOCALAPPDATA")

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
	if strings.Contains(pathLower, "chrome") {
		// Determine the Chrome channel from the install path.
		// Chrome Dev:    …\Google\Chrome Dev\Application\chrome.exe
		// Chrome Canary: …\Google\Chrome SxS\Application\chrome.exe
		// Chrome Beta:   …\Google\Chrome Beta\Application\chrome.exe
		// Chrome Stable: …\Google\Chrome\Application\chrome.exe
		switch {
		case strings.Contains(pathLower, "chrome dev"):
			return filepath.Join(localAppData, "Google", "Chrome Dev", "User Data")
		case strings.Contains(pathLower, "chrome sxs"):
			return filepath.Join(localAppData, "Google", "Chrome SxS", "User Data")
		case strings.Contains(pathLower, "chrome beta"):
			return filepath.Join(localAppData, "Google", "Chrome Beta", "User Data")
		default:
			return filepath.Join(localAppData, "Google", "Chrome", "User Data")
		}
	}
	return ""
}

// scanMSIXBrowsers detects MSIX/AppX-packaged browsers by looking for their
// App Execution Alias stubs in %LOCALAPPDATA%\Microsoft\WindowsApps.
// The list of known MSIX browsers is read from the browser definitions file.
func scanMSIXBrowsers() []Browser {
	var browsers []Browser

	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		return browsers
	}

	windowsAppsDir := filepath.Join(localAppData, "Microsoft", "WindowsApps")

	for _, entry := range DefsGetMSIXBrowsers() {
		// Check the package-specific subdirectory first (more reliable)
		exePath := filepath.Join(windowsAppsDir, entry.PackageFamilyID, entry.ExeName)
		if _, err := os.Stat(exePath); err == nil {
			browsers = append(browsers, Browser{
				Name: entry.DisplayName,
				Path: exePath,
				Type: entry.BrowserType,
			})
			continue
		}

		// Fall back to the top-level WindowsApps alias
		exePath = filepath.Join(windowsAppsDir, entry.ExeName)
		if _, err := os.Stat(exePath); err == nil {
			browsers = append(browsers, Browser{
				Name: entry.DisplayName,
				Path: exePath,
				Type: entry.BrowserType,
			})
		}
	}

	return browsers
}
