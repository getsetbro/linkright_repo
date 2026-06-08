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
	a.browsers = DetectBrowsers()

	// First-run: auto-register as a browser (skip in dev mode and tray/picker modes)
	if !a.devMode && !a.IsTrayMode() && a.GetCurrentURL() == "" {
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

// GetBrowsers returns all detected browsers with their profiles
func (a *App) GetBrowsers() []Browser {
	a.browsers = DetectBrowsers()
	return a.browsers
}

// RefreshBrowsers re-scans for browsers and returns the updated list
func (a *App) RefreshBrowsers() []Browser {
	a.browsers = DetectBrowsers()
	return a.browsers
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

	// For protocol URLs with no rule, try the system-registered handler automatically
	if IsProtocolURL(rawURL) {
		if err := LaunchProtocolURL(rawURL); err == nil {
			return "launched"
		}
	}

	return "picker"
}

// GetPickerData returns the data needed to display the picker popup.
// For protocol URLs with no registered handler, a warning is included.
func (a *App) GetPickerData() PickerRequest {
	rawURL := a.GetCurrentURL()
	req := PickerRequest{
		URL:      rawURL,
		Domain:   ExtractDomain(rawURL),
		Reason:   "no_rule",
		Browsers: a.browsers,
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
				Name:        domain,
				Pattern:     domain,
				MatchType:   "domain",
				Conditions:  []Condition{{Field: "host", Operator: "contains", Value: domain}},
				ConditionLogic: "all",
				Browser:     resp.BrowserName,
				BrowserPath: resp.BrowserPath,
				Profile:     resp.Profile,
				ProfileName: resp.ProfileName,
				Enabled:     true,
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

// ---- Startup / Tray Settings ----

// GetStartWithWindows returns whether the tray startup shortcut is enabled.
// It reflects the live state of the shortcut file, not just the config value.
func (a *App) GetStartWithWindows() bool {
	return IsStartupEnabled()
}

// SetStartWithWindows creates or removes the Windows Startup shortcut for the
// tray and persists the preference to config.
func (a *App) SetStartWithWindows(enabled bool) error {
	a.config.StartWithWindows = enabled
	if err := SaveConfig(a.config); err != nil {
		return err
	}
	if enabled {
		return EnableStartup()
	}
	return DisableStartup()
}

// ---- Tray Popup Methods (Phase 9a) ----

// IsTrayMode returns true when the app was launched with the --tray flag.
func (a *App) IsTrayMode() bool {
	for _, arg := range os.Args[1:] {
		if arg == "--tray" {
			return true
		}
	}
	return false
}

// GetClipboardURL reads the system clipboard and returns the text if it looks
// like a URL (has a recognised scheme), otherwise returns an empty string.
func (a *App) GetClipboardURL() string {
	text := ReadClipboardText()
	text = strings.TrimSpace(text)
	if ExtractScheme(text) != "" {
		return text
	}
	return ""
}

// GetTrayData returns everything the tray popup needs in one call:
// the detected browsers, the current default browser name, and any
// clipboard URL.
func (a *App) GetTrayData() TrayData {
	a.config = LoadConfig()
	a.browsers = DetectBrowsers()
	return TrayData{
		Browsers:       a.browsers,
		DefaultBrowser: a.config.DefaultBrowser,
		ClipboardURL:   a.GetClipboardURL(),
	}
}

// OpenURLFromClipboard reads the clipboard URL and runs it through the full
// rule-matching + launch pipeline (same as if the URL had been passed on the
// command line).  Returns "launched" or "picker".
func (a *App) OpenURLFromClipboard() string {
	url := a.GetClipboardURL()
	if url == "" {
		return "no_url"
	}
	return a.ProcessURL(url)
}

// LaunchBrowserByName opens the clipboard URL directly in the named browser,
// bypassing all rules.  Used when the user clicks a specific browser row in
// the tray popup.
func (a *App) LaunchBrowserByName(browserName string) error {
	url := a.GetClipboardURL()
	if url == "" {
		return nil
	}
	for _, b := range a.browsers {
		if b.Name == browserName {
			return LaunchBrowser(b.Path, "", url)
		}
	}
	return nil
}

// OpenSettings spawns a new LinkRight process in settings mode (no URL arg).
func (a *App) OpenSettings() error {
	exePath := GetExePath()
	if exePath == "" {
		return nil
	}
	cmd := exec.Command(exePath)
	return cmd.Start()
}

// QuitApp closes the tray popup window.
func (a *App) QuitApp() {
	runtime.Quit(a.ctx)
}
