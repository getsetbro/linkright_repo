package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"golang.org/x/sys/windows/registry"
)

// ExtractScheme returns the lowercase scheme of a URL (without "://").
// Returns empty string if the URL has no scheme or cannot be parsed.
// Examples:
//
//	"figma://file/abc"  → "figma"
//	"https://github.com" → "https"
//	"not-a-url"         → ""
func ExtractScheme(rawURL string) string {
	idx := strings.Index(rawURL, "://")
	if idx <= 0 {
		return ""
	}
	return strings.ToLower(rawURL[:idx])
}

// IsProtocolURL returns true when the URL uses a non-http(s) scheme,
// i.e. it is intended for a desktop protocol handler rather than a browser.
func IsProtocolURL(rawURL string) bool {
	scheme := ExtractScheme(rawURL)
	return scheme != "" && scheme != "http" && scheme != "https"
}

// LookupProtocolApp queries HKCU and HKCR for the desktop application
// registered to handle the given scheme (e.g. "figma", "msteams").
// Returns nil when no handler is registered.
func LookupProtocolApp(scheme string) *ProtocolApp {
	scheme = strings.ToLower(scheme)

	// Try HKCU\SOFTWARE\Classes\<scheme>\shell\open\command first (user-level),
	// then fall back to HKCR\<scheme>\shell\open\command (machine-level).
	roots := []registry.Key{registry.CURRENT_USER, registry.CLASSES_ROOT}
	prefixes := []string{`SOFTWARE\Classes\`, ``}

	for i, root := range roots {
		keyPath := prefixes[i] + scheme + `\shell\open\command`
		k, err := registry.OpenKey(root, keyPath, registry.READ)
		if err != nil {
			continue
		}
		cmdLine, _, err := k.GetStringValue("")
		k.Close()
		if err != nil || cmdLine == "" {
			continue
		}

		// Try to read a friendly app name from the scheme root key
		appName := scheme
		nameKeyPath := prefixes[i] + scheme
		nk, err := registry.OpenKey(root, nameKeyPath, registry.READ)
		if err == nil {
			if v, _, e := nk.GetStringValue(""); e == nil && v != "" {
				appName = v
			}
			nk.Close()
		}

		exePath := extractExePath(cmdLine)
		available := false
		if exePath != "" {
			if _, err := os.Stat(exePath); err == nil {
				available = true
			} else {
				// If the path is not absolute, try to resolve it via PATH
				// (e.g. MSIX apps like ms-teams.exe that live in WindowsApps)
				if resolved, lookErr := exec.LookPath(exePath); lookErr == nil {
					exePath = resolved
					available = true
				}
			}
		}

		return &ProtocolApp{
			Scheme:      scheme,
			AppName:     appName,
			CommandLine: cmdLine,
			ExePath:     exePath,
			IsAvailable: available,
		}
	}

	return nil
}

// LaunchProtocolURL opens a protocol URL using the system-registered handler.
// It substitutes the URL into the registered command line (%1 placeholder).
// If no handler is registered or the exe is missing, it returns an error.
func LaunchProtocolURL(rawURL string) error {
	scheme := ExtractScheme(rawURL)
	if scheme == "" {
		return fmt.Errorf("URL has no scheme: %s", rawURL)
	}

	app := LookupProtocolApp(scheme)
	if app == nil {
		return fmt.Errorf("no handler registered for protocol: %s", scheme)
	}
	if !app.IsAvailable {
		return fmt.Errorf("handler for %s:// is registered but the application was not found at: %s", scheme, app.ExePath)
	}

	// Build the command by substituting %1 with the URL.
	// The registered command line may look like:
	//   "C:\path\to\app.exe" "%1"
	//   C:\path\to\app.exe %1
	cmdLine := strings.ReplaceAll(app.CommandLine, "%1", rawURL)

	// Split into exe + args using the same logic as extractExePath
	exePath := app.ExePath
	var args []string

	rest := strings.TrimSpace(cmdLine)
	if rest[0] == '"' {
		// Quoted exe path
		end := strings.Index(rest[1:], `"`)
		if end >= 0 {
			rest = strings.TrimSpace(rest[end+2:])
		}
	} else {
		parts := strings.SplitN(rest, " ", 2)
		if len(parts) == 2 {
			rest = strings.TrimSpace(parts[1])
		} else {
			rest = ""
		}
	}

	// Parse remaining args (handle quoted tokens)
	if rest != "" {
		args = splitArgs(rest)
	}

	cmd := exec.Command(exePath, args...)
	hideWindow(cmd)
	return cmd.Start()
}

// splitArgs splits a command-line argument string into individual tokens,
// respecting double-quoted strings.
func splitArgs(s string) []string {
	var args []string
	var current strings.Builder
	inQuote := false

	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '"':
			inQuote = !inQuote
		case c == ' ' && !inQuote:
			if current.Len() > 0 {
				args = append(args, current.String())
				current.Reset()
			}
		default:
			current.WriteByte(c)
		}
	}
	if current.Len() > 0 {
		args = append(args, current.String())
	}
	return args
}

// GetProtocolAppsForRules inspects all protocol-type rules and returns
// the ProtocolApp lookup result for each unique scheme referenced.
// This is used by the frontend to show availability warnings.
func GetProtocolAppsForRules(rules []Rule) []ProtocolApp {
	seen := map[string]bool{}
	var apps []ProtocolApp

	for _, r := range rules {
		if r.MatchType != "protocol" {
			continue
		}
		scheme := strings.ToLower(strings.TrimSpace(r.Pattern))
		if scheme == "" || seen[scheme] {
			continue
		}
		seen[scheme] = true

		app := LookupProtocolApp(scheme)
		if app != nil {
			apps = append(apps, *app)
		} else {
			apps = append(apps, ProtocolApp{
				Scheme:      scheme,
				AppName:     scheme,
				IsAvailable: false,
			})
		}
	}

	return apps
}
