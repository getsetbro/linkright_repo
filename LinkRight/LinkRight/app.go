package main

import (
	"context"
	"os"
	"os/exec"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct holds application state
type App struct {
	ctx      context.Context
	config   Config
	browsers []Browser
	devMode  bool
}

// NewApp creates a new App instance
func NewApp(devMode bool) *App {
	return &App{
		devMode: devMode,
	}
}

// startup is called when the app starts
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.config = LoadConfig()
	a.browsers = applyArchivedState(DetectBrowsers(), a.config.ArchivedBrowserPaths)

	// First-run: auto-register as a browser (skip in dev mode and picker modes)
	if !a.devMode && a.GetCurrentURL() == "" {
		if a.config.FirstRun || !IsRegistered() {
			_ = RegisterApp()
			a.config.FirstRun = false
			_ = SaveConfig(a.config)
		}
	}
}

// IsDevMode returns true when running via `wails dev` or with --dev flag
func (a *App) IsDevMode() bool {
	return a.devMode
}

// isDevMode checks env/args for dev mode indicators
func isDevMode(args []string) bool {
	// Wails sets this env var when running `wails dev`
	if os.Getenv("WAILS_DEV") == "true" {
		return true
	}
	// Also support explicit --dev flag for manual testing
	for _, arg := range args {
		if arg == "--dev" {
			return true
		}
	}
	return false
}

// domReady is called after the frontend DOM is ready
func (a *App) domReady(ctx context.Context) {}

// ---- Browser & Profile Methods ----

// GetBrowsers returns all detected browsers with archived state applied.
// Archived browsers are included in the list (with Archived=true) so the
// settings UI can display and un-archive them, but they are excluded from
// the picker and rule selectors via GetActiveBrowsers.
func (a *App) GetBrowsers() []Browser {
	a.config = LoadConfig()
	a.browsers = applyArchivedState(DetectBrowsers(), a.config.ArchivedBrowserPaths)
	return a.browsers
}

// GetActiveBrowsers returns only non-archived browsers for use in the picker
// and rule selectors.
func (a *App) GetActiveBrowsers() []Browser {
	all := a.GetBrowsers()
	var active []Browser
	for _, b := range all {
		if !b.Archived {
			active = append(active, b)
		}
	}
	return active
}

// RefreshBrowsers re-scans for browsers and returns the updated list (with archived state).
func (a *App) RefreshBrowsers() []Browser {
	a.config = LoadConfig()
	a.browsers = applyArchivedState(DetectBrowsers(), a.config.ArchivedBrowserPaths)
	return a.browsers
}

// ArchiveBrowser marks a browser as archived so it is hidden from the picker
// and rule selectors. The browser is not deleted — it can be un-archived at
// any time. Only browsers that the app has detected can be archived.
func (a *App) ArchiveBrowser(path string) error {
	a.config = LoadConfig()
	// Add to archived list if not already present
	for _, p := range a.config.ArchivedBrowserPaths {
		if strings.EqualFold(p, path) {
			return nil // already archived
		}
	}
	a.config.ArchivedBrowserPaths = append(a.config.ArchivedBrowserPaths, path)
	if err := SaveConfig(a.config); err != nil {
		return err
	}
	a.browsers = applyArchivedState(DetectBrowsers(), a.config.ArchivedBrowserPaths)
	return nil
}

// UnarchiveBrowser removes a browser from the archived list, making it
// visible again in the picker and rule selectors.
func (a *App) UnarchiveBrowser(path string) error {
	a.config = LoadConfig()
	var kept []string
	for _, p := range a.config.ArchivedBrowserPaths {
		if !strings.EqualFold(p, path) {
			kept = append(kept, p)
		}
	}
	a.config.ArchivedBrowserPaths = kept
	if err := SaveConfig(a.config); err != nil {
		return err
	}
	a.browsers = applyArchivedState(DetectBrowsers(), a.config.ArchivedBrowserPaths)
	return nil
}

// applyArchivedState stamps the Archived flag onto each browser based on the
// saved list of archived paths.
func applyArchivedState(browsers []Browser, archivedPaths []string) []Browser {
	archived := map[string]bool{}
	for _, p := range archivedPaths {
		archived[strings.ToLower(p)] = true
	}
	result := make([]Browser, len(browsers))
	for i, b := range browsers {
		b.Archived = archived[strings.ToLower(b.Path)]
		result[i] = b
	}
	return result
}

// ---- Rule Methods ----

// GetRules returns all rules from config
func (a *App) GetRules() []Rule {
	a.config = LoadConfig()
	return a.config.Rules
}

// SaveRule creates or updates a rule
func (a *App) SaveRule(rule Rule) error {
	if rule.ID == "" {
		return AddRule(&a.config, rule)
	}
	return UpdateRule(&a.config, rule)
}

// DeleteRule removes a rule by ID
func (a *App) DeleteRule(id string) error {
	return DeleteRule(&a.config, id)
}

// ReorderRules reorders rules by the given list of IDs
func (a *App) ReorderRules(orderedIDs []string) error {
	return ReorderRules(&a.config, orderedIDs)
}

// ValidateRules checks all rules for missing browsers/profiles
func (a *App) ValidateRules() []RuleValidation {
	return ValidateRules(a.config.Rules, a.browsers)
}

// ---- Config Methods ----

// GetConfig returns the current configuration
func (a *App) GetConfig() Config {
	a.config = LoadConfig()
	return a.config
}

// SaveSettings saves the general settings (default browser, fallback behavior)
func (a *App) SaveSettings(defaultBrowser, defaultProfile, fallbackBehavior string) error {
	a.config.DefaultBrowser = defaultBrowser
	a.config.DefaultProfile = defaultProfile
	a.config.FallbackBehavior = fallbackBehavior
	return SaveConfig(a.config)
}

// GetPickerSettings returns the current picker popup settings
func (a *App) GetPickerSettings() PickerSettings {
	a.config = LoadConfig()
	return a.config.PickerSettings
}

// SavePickerSettings saves the picker popup appearance settings
func (a *App) SavePickerSettings(settings PickerSettings) error {
	a.config.PickerSettings = settings
	return SaveConfig(a.config)
}

// ---- First-Run Methods ----

// IsFirstRun returns true if this is the first time the app has been launched
// (i.e. the user has not yet been asked to set Link Right as the default browser).
func (a *App) IsFirstRun() bool {
	return !IsDefaultBrowser()
}

// MarkFirstRunComplete marks the first-run flow as done so the picker is not shown again.
func (a *App) MarkFirstRunComplete() error {
	a.config.FirstRun = false
	return SaveConfig(a.config)
}

// ---- Registry Methods ----

// GetAppStatus returns the current registration status
func (a *App) GetAppStatus() AppStatus {
	return AppStatus{
		IsRegistered:     IsRegistered(),
		IsDefaultBrowser: IsDefaultBrowser(),
		ExePath:          GetExePath(),
	}
}

// RegisterAsDefaultBrowser registers Link Right in the Windows registry
func (a *App) RegisterAsDefaultBrowser() error {
	return RegisterApp()
}

// UnregisterAsDefaultBrowser removes Link Right from the Windows registry
func (a *App) UnregisterAsDefaultBrowser() error {
	return UnregisterApp()
}

// OpenDefaultAppsSettings opens the Windows Default Apps settings page
func (a *App) OpenDefaultAppsSettings() error {
	return OpenDefaultAppsSettings()
}

// ---- URL Processing Methods (Phase 6) ----

// GetCurrentURL returns the URL passed as a command-line argument, if any.
// Accepts http://, https://, and any other scheme (protocol handler URLs).
// Returns empty string when launched without a URL (settings mode).
func (a *App) GetCurrentURL() string {
	args := os.Args[1:]
	for _, arg := range args {
		if strings.HasPrefix(arg, "--") {
			// skip flag arguments
			continue
		}
		if ExtractScheme(arg) != "" {
			return arg
		}
	}
	return ""
}

// IsPickerMode returns true when the app was launched with a URL argument
// and no matching rule was found (picker popup should be shown).
func (a *App) IsPickerMode() bool {
	return a.GetCurrentURL() != ""
}

// ProcessURL evaluates rules for the given URL and returns the result:
// "launched"  — a rule matched and the handler/browser was opened successfully
// "picker"    — no rule matched, or launch failed; show the picker popup
func (a *App) ProcessURL(rawURL string) string {
	rule := FindMatchingRule(rawURL, a.config.Rules)

	// Protocol URL with a matching rule → launch the registered desktop app
	if rule != nil && rule.MatchType == "protocol" {
		if err := LaunchProtocolURL(rawURL); err == nil {
			return "launched"
		}
		// Launch failed — fall through to picker
		return "picker"
	}

	// Non-protocol rule matched → launch the browser directly
	if rule != nil {
		if rule.BrowserPath != "" {
			if err := LaunchBrowser(rule.BrowserPath, rule.Profile, rawURL); err == nil {
				return "launched"
			}
		}
		// Launch failed — fall through to picker
		return "picker"
	}

	// No rule matched — check fallback behavior
	if a.config.FallbackBehavior == "default" && a.config.DefaultBrowser != "" {
		// Find the default browser path
		for _, b := range a.browsers {
			if b.Name == a.config.DefaultBrowser {
				profile := a.config.DefaultProfile
				if err := LaunchBrowser(b.Path, profile, rawURL); err == nil {
					return "launched"
				}
				break
			}
		}
	}

	// If the user chose "picker" as fallback, show the picker immediately.
	// Do NOT fall through to launchWithOS — that would re-invoke LinkRight
	// (the default browser) and cause an infinite loop.
	if a.config.FallbackBehavior == "picker" {
		return "picker"
	}

	// For protocol URLs with no rule, try the system-registered handler automatically
	if IsProtocolURL(rawURL) {
		if err := LaunchProtocolURL(rawURL); err == nil {
			return "launched"
		}
	}

	// Last resort: hand the URL to the OS (ShellExecute / cmd /c start).
	// This prevents a dead-end when no picker browsers are available.
	if err := launchWithOS(rawURL); err == nil {
		return "launched"
	}

	return "picker"
}

// GetPickerData returns the data needed to display the picker popup.
// Only non-archived browsers are included. For protocol URLs with no
// registered handler, a warning is included.
func (a *App) GetPickerData() PickerRequest {
	rawURL := a.GetCurrentURL()
	// Only show active (non-archived) browsers in the picker
	var activeBrowsers []Browser
	for _, b := range a.browsers {
		if !b.Archived {
			activeBrowsers = append(activeBrowsers, b)
		}
	}
	req := PickerRequest{
		URL:      rawURL,
		Domain:   ExtractDomain(rawURL),
		Reason:   "no_rule",
		Browsers: activeBrowsers,
	}

	if IsProtocolURL(rawURL) {
		scheme := ExtractScheme(rawURL)
		app := LookupProtocolApp(scheme)
		if app == nil {
			req.Reason = "no_protocol_handler"
			req.Warning = "No application is registered to handle the \"" + scheme + "://\" protocol on this computer."
		} else if !app.IsAvailable {
			req.Reason = "missing_protocol_handler"
			req.Warning = "The application registered for \"" + scheme + "://\" links (" + app.AppName + ") could not be found."
		}
	}

	return req
}

// OpenWithBrowser opens the current URL with the selected browser/profile.
func (a *App) OpenWithBrowser(resp PickerResponse) error {
	url := a.GetCurrentURL()
	if url == "" {
		return nil
	}
	if resp.AlwaysUse {
		if IsProtocolURL(url) {
			// Save a protocol rule so future links auto-launch
			scheme := ExtractScheme(url)
			rule := Rule{
				Name:      scheme + "://",
				Pattern:   scheme,
				MatchType: "protocol",
				Enabled:   true,
			}
			_ = AddRule(&a.config, rule)
		} else {
			domain := ExtractDomain(url)
			rule := Rule{
				Name:           domain,
				Pattern:        domain,
				MatchType:      "contains",
				Conditions:     []Condition{{Field: "url", Operator: "contains", Value: domain}},
				ConditionLogic: "all",
				Browser:        resp.BrowserName,
				BrowserPath:    resp.BrowserPath,
				Profile:        resp.Profile,
				ProfileName:    resp.ProfileName,
				Enabled:        true,
			}
			_ = AddRule(&a.config, rule)
		}
	}
	return LaunchBrowser(resp.BrowserPath, resp.Profile, url)
}

// CancelPicker closes the picker popup without opening a browser.
func (a *App) CancelPicker() {
	runtime.Quit(a.ctx)
}

// ---- Protocol Handler Methods (Phase 5b) ----

// LookupProtocol returns the desktop app registered for the given scheme,
// or nil if no handler is found. Exposed to the frontend for UI display.
func (a *App) LookupProtocol(scheme string) *ProtocolApp {
	return LookupProtocolApp(scheme)
}

// GetProtocolApps returns ProtocolApp info for every protocol-type rule,
// so the frontend can show availability warnings.
func (a *App) GetProtocolApps() []ProtocolApp {
	return GetProtocolAppsForRules(a.config.Rules)
}

// launchWithOS hands a URL to the Windows shell (cmd /c start ""), which
// lets the OS decide which application to open it with. This is the last-
// resort fallback when no browser or protocol handler could be found.
func launchWithOS(url string) error {
	cmd := exec.Command("cmd", "/c", "start", "", url)
	hideWindow(cmd)
	return cmd.Start()
}

