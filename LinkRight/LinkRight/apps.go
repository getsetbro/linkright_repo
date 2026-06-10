package main

import (
	"net/url"
	"strings"
)

// builtinAppRedirects defines the known desktop apps that can intercept web URLs.
// Each entry maps web domains to a protocol scheme used by the desktop app.
var builtinAppRedirects = []AppRedirect{
	{
		ID:      "figma",
		Name:    "Figma",
		Scheme:  "figma",
		Domains: []string{"figma.com", "www.figma.com"},
	},
	{
		ID:      "teams",
		Name:    "Microsoft Teams",
		Scheme:  "msteams",
		Domains: []string{"teams.microsoft.com", "teams.live.com"},
	},
}

// GetAppRedirects returns all known app redirects with their current enabled
// and availability status. Enabled state comes from config; availability is
// checked by looking up the protocol handler in the Windows registry.
func (a *App) GetAppRedirects() []AppRedirect {
	a.config = LoadConfig()
	enabledSet := map[string]bool{}
	for _, id := range a.config.EnabledAppRedirects {
		enabledSet[id] = true
	}

	result := make([]AppRedirect, len(builtinAppRedirects))
	for i, app := range builtinAppRedirects {
		app.Enabled = enabledSet[app.ID]
		// Check if the desktop app is installed by looking up its protocol handler
		protocolApp := LookupProtocolApp(app.Scheme)
		app.IsAvailable = protocolApp != nil && protocolApp.IsAvailable
		result[i] = app
	}
	return result
}

// SetAppRedirectEnabled enables or disables a specific app redirect by ID.
func (a *App) SetAppRedirectEnabled(appID string, enabled bool) error {
	a.config = LoadConfig()

	// Remove the ID if present
	var kept []string
	for _, id := range a.config.EnabledAppRedirects {
		if id != appID {
			kept = append(kept, id)
		}
	}

	// Add it back if enabling
	if enabled {
		kept = append(kept, appID)
	}

	a.config.EnabledAppRedirects = kept
	return SaveConfig(a.config)
}

// FindAppRedirectForURL checks if the given URL matches any enabled app redirect.
// Returns the matching AppRedirect and the rewritten protocol URL, or nil if no match.
func FindAppRedirectForURL(rawURL string, enabledIDs []string) (*AppRedirect, string) {
	if len(enabledIDs) == 0 {
		return nil, ""
	}

	enabledSet := map[string]bool{}
	for _, id := range enabledIDs {
		enabledSet[id] = true
	}

	parsed, err := url.Parse(rawURL)
	if err != nil {
		return nil, ""
	}

	host := strings.ToLower(parsed.Hostname())

	for i := range builtinAppRedirects {
		app := &builtinAppRedirects[i]
		if !enabledSet[app.ID] {
			continue
		}

		// Do not redirect unless the app is actually detected on the system
		protocolApp := LookupProtocolApp(app.Scheme)
		if protocolApp == nil || !protocolApp.IsAvailable {
			continue
		}

		for _, domain := range app.Domains {
			if host == domain || strings.HasSuffix(host, "."+domain) {
				// Build the protocol URL to launch the desktop app
				protocolURL := buildProtocolURL(app, rawURL)
				return app, protocolURL
			}
		}
	}

	return nil, ""
}

// buildProtocolURL converts a web URL into the appropriate protocol URL
// for the desktop app to handle.
func buildProtocolURL(app *AppRedirect, webURL string) string {
	switch app.ID {
	case "figma":
		// Figma desktop app accepts figma://file/... URLs
		// Convert https://www.figma.com/file/abc → figma://file/abc
		// Convert https://www.figma.com/design/abc → figma://file/abc
		parsed, err := url.Parse(webURL)
		if err != nil {
			return app.Scheme + "://" + webURL
		}
		path := parsed.Path
		// Figma uses /file/ or /design/ or /proto/ etc.
		return app.Scheme + "://" + strings.TrimPrefix(path, "/")

	case "teams":
		// Teams uses msteams:// protocol — pass the full URL for deep linking
		// msteams://l/meetup-join?url=<encoded-url>
		return "msteams://l/meetup-join?url=" + url.QueryEscape(webURL)

	default:
		return app.Scheme + "://" + webURL
	}
}
