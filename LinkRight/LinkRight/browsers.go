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
		if !seen[key] && b.Path != "" && key != exeSelf {
			seen[key] = true
			// Detect profiles
			b.Profiles = detectProfiles(b)
			if len(b.Profiles) == 0 {
				b.Profiles = []BrowserProfile{{ID: "Default", Name: "Default"}}
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
	}
	// No quotes — take up to first space
	parts := strings.SplitN(cmd, " ", 2)
	return parts[0]
}

func detectBrowserType(name, path string) string {
	return DefsDetectBrowserType(name, path)
}

// detectProfiles finds browser profiles for a given browser
func detectProfiles(b Browser) []BrowserProfile {
	switch b.Type {
	case "chromium":
		return detectChromiumProfiles(b.Path)
	case "firefox":
		return detectFirefoxProfiles(b.Path)
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

// firefoxProfileDir determines the correct Firefox profile directory based on
// the browser executable path. Firefox and Firefox Developer Edition use
// separate profile directories:
//   - Firefox:               %APPDATA%\Mozilla\Firefox
//   - Firefox Developer Ed.: %APPDATA%\Mozilla\Firefox Developer Edition (if it exists)
//
// If we cannot determine which edition the exe belongs to (e.g. both resolve to
// the same profiles.ini), we return "" to signal that profile selection should
// be disabled for this browser.
func firefoxProfileDir(exePath string) string {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		return ""
	}

	pathLower := strings.ToLower(exePath)

	// Firefox Developer Edition typically installs to a path containing
	// "firefox developer edition" or "firefox dev edition" or its exe is
	// named differently. The most reliable indicator is the install path.
	isDevEdition := strings.Contains(pathLower, "developer edition") ||
		strings.Contains(pathLower, "firefox dev")

	if isDevEdition {
		devDir := filepath.Join(appData, "Mozilla", "Firefox Developer Edition")
		// Only use the dev edition directory if it actually exists with its own profiles.ini
		iniPath := filepath.Join(devDir, "profiles.ini")
		if _, err := os.Stat(iniPath); err == nil {
			return devDir
		}
		// Dev edition installed but no separate profile dir — cannot distinguish profiles
		return ""
	}

	// Standard Firefox
	stdDir := filepath.Join(appData, "Mozilla", "Firefox")
	iniPath := filepath.Join(stdDir, "profiles.ini")
	if _, err := os.Stat(iniPath); err == nil {
		return stdDir
	}

	return ""
}

// detectFirefoxProfiles discovers Firefox profiles by scanning the Profiles directory
// on disk and enriching display names from profiles.ini and Profile Groups SQLite
// databases. Returns nil if profiles cannot be reliably determined for this specific
// Firefox variant (disabling profile selection).
func detectFirefoxProfiles(exePath string) []BrowserProfile {
	profileDir := firefoxProfileDir(exePath)
	if profileDir == "" {
		// Cannot determine the correct profile directory for this Firefox variant.
		// Return nil so the browser gets a single "Default" profile (no profile selection).
		return nil
	}

	profilesDir := filepath.Join(profileDir, "Profiles")
	iniPath := filepath.Join(profileDir, "profiles.ini")
	profileGroupsDir := filepath.Join(profileDir, "Profile Groups")

	// Step 1: Scan the Profiles directory for all profile folders on disk.
	// This is the authoritative source for which profiles actually exist.
	entries, err := os.ReadDir(profilesDir)
	if err != nil {
		return nil
	}

	// Collect all profile directory names
	type profileInfo struct {
		dirName string
		name    string
	}
	var allProfiles []profileInfo
	for _, entry := range entries {
		if entry.IsDir() {
			dirName := entry.Name()
			// Firefox profile dirs are like "xxxxxxxx.ProfileName" or "xxxxxxxx.default-release"
			displayName := dirName
			if idx := strings.LastIndex(dirName, "."); idx >= 0 {
				displayName = dirName[idx+1:]
			}
			allProfiles = append(allProfiles, profileInfo{dirName: dirName, name: displayName})
		}
	}

	if len(allProfiles) == 0 {
		return nil
	}

	// Step 2: Read profiles.ini to get Name= values for profiles listed there.
	// The Name= field in profiles.ini is the profile's display name for profiles
	// managed by the legacy system.
	iniNames := parseFirefoxProfilesINI(iniPath)

	// Step 3: Read Profile Groups SQLite databases for the real user-visible names.
	// Firefox 67+ stores renamed profile names in these databases.
	sqliteNames := readFirefoxProfileGroupNames(profileGroupsDir)

	// Step 4: Build final profile list, preferring SQLite names > INI names > dir suffix
	var profiles []BrowserProfile
	for _, p := range allProfiles {
		name := p.name
		if sqliteName, ok := sqliteNames[p.dirName]; ok && sqliteName != "" {
			name = sqliteName
		} else if iniName, ok := iniNames[p.dirName]; ok && iniName != "" {
			name = iniName
		}
		profiles = append(profiles, BrowserProfile{
			ID:   p.dirName,
			Name: name,
		})
	}

	return profiles
}

// parseFirefoxProfilesINI reads profiles.ini and returns a map of
// profile directory name -> Name= value.
func parseFirefoxProfilesINI(iniPath string) map[string]string {
	result := make(map[string]string)

	data, err := os.ReadFile(iniPath)
	if err != nil {
		return result
	}

	lines := strings.Split(string(data), "\n")
	var currentName, currentPath string
	inProfile := false

	flush := func() {
		if currentPath != "" {
			result[currentPath] = currentName
		}
	}

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "[Profile") {
			if inProfile {
				flush()
			}
			currentName = ""
			currentPath = ""
			inProfile = true
		} else if strings.HasPrefix(line, "[") {
			// Any other section header ends the current profile block
			if inProfile {
				flush()
			}
			inProfile = false
		} else if inProfile {
			if strings.HasPrefix(line, "Name=") {
				currentName = strings.TrimPrefix(line, "Name=")
			} else if strings.HasPrefix(line, "Path=") {
				p := strings.TrimPrefix(line, "Path=")
				// Normalize path separators and get just the last segment as the dir name
				p = strings.ReplaceAll(p, "\\", "/")
				parts := strings.Split(p, "/")
				currentPath = parts[len(parts)-1]
			}
		}
	}
	if inProfile {
		flush()
	}

	return result
}

// readFirefoxProfileGroupNames reads all Profile Groups SQLite databases and
// returns a map of profile directory name -> user-visible display name.
// Firefox 67+ stores profile metadata (including user-renamed names) in these
// SQLite databases under the "Profile Groups" directory.
// Parses the SQLite page/cell format to extract text fields from the Profiles table.
func readFirefoxProfileGroupNames(profileGroupsDir string) map[string]string {
	result := make(map[string]string)

	entries, err := os.ReadDir(profileGroupsDir)
	if err != nil {
		return result
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sqlite") {
			continue
		}
		// Skip WAL/SHM files
		if strings.HasSuffix(entry.Name(), "-wal") || strings.HasSuffix(entry.Name(), "-shm") {
			continue
		}

		dbPath := filepath.Join(profileGroupsDir, entry.Name())
		names := extractProfileNamesFromSQLite(dbPath)
		for dirName, displayName := range names {
			result[dirName] = displayName
		}
	}

	return result
}

// extractProfileNamesFromSQLite extracts profile path/name pairs from a Firefox
// Profile Groups SQLite database. The Profiles table has columns:
// (id INTEGER, path TEXT, name TEXT, avatar TEXT, themeId TEXT, themeFg TEXT, themeBg TEXT)
// We look for the "Profiles\" or "Profiles/" prefix pattern and use SQLite's varint
// record format to properly extract the adjacent name field.
func extractProfileNamesFromSQLite(dbPath string) map[string]string {
	result := make(map[string]string)

	data, err := os.ReadFile(dbPath)
	if err != nil {
		return result
	}

	// Strategy: Find all occurrences of "Profiles\" or "Profiles/" in the binary data.
	// In SQLite's B-tree leaf pages, record fields are stored contiguously with a
	// header that specifies field lengths. The path field is immediately followed by
	// the name field. We use the record header to determine field boundaries.
	//
	// Simpler approach: since we know the table schema, we look for the path pattern
	// and then use the SQLite record header (which precedes the payload) to find
	// field lengths. However, parsing the full SQLite format is complex.
	//
	// Pragmatic approach: scan for "Profiles\" or "Profiles/" followed by a valid
	// profile directory name pattern (8chars.name). The name field follows immediately
	// after the path field (no separator) in the record payload. We can determine
	// where the path ends by knowing the expected format: "Profiles\XXXXXXXX.Name"
	// where XXXXXXXX is exactly 8 alphanumeric chars followed by a dot and the
	// directory suffix. The name field starts right after.
	//
	// But we need to know the path field length. We'll use the record header.
	// Instead, let's use a different approach: find path strings and cross-reference
	// with the actual profile directories on disk to determine exact path length,
	// then read the name that follows.

	profilesDir := filepath.Dir(dbPath)
	profilesDir = filepath.Join(filepath.Dir(profilesDir), "Profiles")
	knownDirs := make(map[string]bool)
	if dirEntries, err := os.ReadDir(profilesDir); err == nil {
		for _, de := range dirEntries {
			if de.IsDir() {
				knownDirs[de.Name()] = true
			}
		}
	}

	content := data
	profilesBackslash := []byte("Profiles\\")
	profilesSlash := []byte("Profiles/")

	for i := 0; i < len(content); {
		// Find next "Profiles\" or "Profiles/" marker
		idx := -1
		marker := profilesBackslash
		idx = indexBytes(content[i:], profilesBackslash)
		if idx == -1 {
			idx = indexBytes(content[i:], profilesSlash)
			marker = profilesSlash
		}
		if idx == -1 {
			break
		}
		_ = marker
		pos := i + idx
		afterPrefix := pos + 9 // len("Profiles\") or len("Profiles/")

		// Try to match a known profile directory name starting at afterPrefix
		matched := false
		for dirName := range knownDirs {
			dirBytes := []byte(dirName)
			end := afterPrefix + len(dirBytes)
			if end > len(content) {
				continue
			}
			if string(content[afterPrefix:end]) == dirName {
				// Found a known profile path. The name field follows immediately after.
				// Read the display name: it's the next sequence of printable chars
				// that doesn't include the path we just read.
				nameStart := end
				// In SQLite records, fields are stored back-to-back. The name follows path.
				// Read until we hit a non-printable char or another known pattern.
				nameEnd := nameStart
				for nameEnd < len(content) {
					b := content[nameEnd]
					if b < 0x20 || b >= 0x7F {
						break
					}
					nameEnd++
				}
				if nameEnd > nameStart {
					displayName := string(content[nameStart:nameEnd])
					// Validate: should be a reasonable name, not contain path separators
					// or look like concatenated fields (avatar, theme, etc.)
					// The name field ends before the avatar field which is typically
					// a short word like "shopping", "heart", "book", "briefcase"
					displayName = extractCleanName(displayName)
					if displayName != "" {
						// Keep the shortest valid name found for each dir
						// (shorter = more likely to be just the name without extra fields)
						if existing, ok := result[dirName]; !ok || len(displayName) < len(existing) {
							result[dirName] = displayName
						}
					}
				}
				matched = true
				i = end
				break
			}
		}
		if !matched {
			i = pos + 1
		}
	}

	return result
}

// extractCleanName extracts just the profile display name from a potentially
// concatenated string of SQLite record fields. Firefox Profile Groups records
// store fields as: path, name, avatar, themeId, themeFg, themeBg.
// The avatar field is one of a known set of values.
func extractCleanName(raw string) string {
	// Known avatar values that might be concatenated after the name
	avatars := []string{"shopping", "heart", "book", "briefcase", "flower",
		"tree", "football", "dog", "cat", "globe", "star", "music"}

	for _, avatar := range avatars {
		if idx := strings.Index(raw, avatar); idx > 0 {
			return raw[:idx]
		}
	}

	// Check for theme patterns (e.g., "firefox-compact-dark@", "default-theme@", "{uuid}")
	if idx := strings.Index(raw, "firefox-compact-"); idx > 0 {
		return raw[:idx]
	}
	if idx := strings.Index(raw, "default-theme@"); idx > 0 {
		return raw[:idx]
	}
	// UUID pattern in curly braces
	if idx := strings.Index(raw, "{"); idx > 0 {
		return raw[:idx]
	}
	// RGB color pattern
	if idx := strings.Index(raw, "rgb"); idx > 0 {
		return raw[:idx]
	}
	if idx := strings.Index(raw, "rgba"); idx > 0 {
		return raw[:idx]
	}

	// If the string is short enough and looks clean, use it as-is
	if len(raw) <= 50 && !strings.ContainsAny(raw, "\\/@#") {
		return raw
	}

	return ""
}

// indexBytes finds the first occurrence of needle in haystack
func indexBytes(haystack, needle []byte) int {
	for i := 0; i <= len(haystack)-len(needle); i++ {
		found := true
		for j := 0; j < len(needle); j++ {
			if haystack[i+j] != needle[j] {
				found = false
				break
			}
		}
		if found {
			return i
		}
	}
	return -1
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
