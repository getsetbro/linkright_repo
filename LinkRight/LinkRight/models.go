package main

// Condition represents a single URL-matching condition within a rule
type Condition struct {
	Field    string `json:"field"`    // "host", "scheme", "path", "query", "url"
	Operator string `json:"operator"` // "contains", "is", "is_not", "begins_with", "ends_with", "matches_regex"
	Value    string `json:"value"`
}

// Rule represents a single URL routing rule
type Rule struct {
	ID             string      `json:"id"`
	Name           string      `json:"name"`
	Pattern        string      `json:"pattern"`        // legacy single-pattern (kept for backward compat)
	MatchType      string      `json:"matchType"`      // legacy: "domain", "wildcard", "contains", "regex", "protocol"
	Conditions     []Condition `json:"conditions"`     // compound conditions (new)
	ConditionLogic string      `json:"conditionLogic"` // "any" or "all" (default "all")
	Browser        string      `json:"browser"`
	BrowserPath    string      `json:"browserPath"`
	Profile        string      `json:"profile"`     // profile directory name e.g. "Profile 1"
	ProfileName    string      `json:"profileName"` // friendly name e.g. "Work"
	Priority       int         `json:"priority"`
	Enabled        bool        `json:"enabled"`
}

// BrowserProfile represents a single browser profile
type BrowserProfile struct {
	ID   string `json:"id"`   // directory name e.g. "Profile 1", "Default"
	Name string `json:"name"` // friendly name e.g. "Work", "Personal"
}

// Browser represents an installed browser
type Browser struct {
	Name     string           `json:"name"`
	Path     string           `json:"path"`
	IconPath string           `json:"iconPath"`
	Profiles []BrowserProfile `json:"profiles"`
	Type     string           `json:"type"`     // "chromium", "firefox", "other"
	Archived bool             `json:"archived"` // true = hidden from picker and rules
}

// PickerSettings controls the appearance and behavior of the picker popup
type PickerSettings struct {
	ShowBrowserNames bool `json:"showBrowserNames"` // show name labels under icons
	ShowURL          bool `json:"showURL"`          // show the full URL in the popup
}

// Config is the root configuration stored in JSON
type Config struct {
	DefaultBrowser       string         `json:"defaultBrowser"`
	DefaultProfile       string         `json:"defaultProfile"`
	FallbackBehavior     string         `json:"fallbackBehavior"`    // "picker" or "default"
	Rules                []Rule         `json:"rules"`
	FirstRun             bool           `json:"firstRun"`
	PickerSettings       PickerSettings `json:"pickerSettings"`
	CustomBrowsers       []Browser      `json:"customBrowsers"`      // user-added custom browsers (legacy, kept for compat)
	ArchivedBrowserPaths []string       `json:"archivedBrowserPaths"` // paths of browsers hidden from picker/rules
	EnabledAppRedirects  []string       `json:"enabledAppRedirects"` // IDs of enabled app redirects e.g. ["figma","teams"]
}

// PickerRequest is sent to the frontend when the picker popup is needed
type PickerRequest struct {
	URL      string    `json:"url"`
	Domain   string    `json:"domain"`
	Reason   string    `json:"reason"`  // "no_rule", "missing_browser", "error"
	Warning  string    `json:"warning"` // optional warning message
	Browsers []Browser `json:"browsers"`
}

// PickerResponse is returned from the frontend when the user picks a browser
type PickerResponse struct {
	BrowserPath string `json:"browserPath"`
	BrowserName string `json:"browserName"`
	Profile     string `json:"profile"`
	ProfileName string `json:"profileName"`
	AlwaysUse   bool   `json:"alwaysUse"`
}

// RuleValidation holds validation state for a rule
type RuleValidation struct {
	RuleID         string `json:"ruleId"`
	BrowserMissing bool   `json:"browserMissing"`
	ProfileMissing bool   `json:"profileMissing"`
	Message        string `json:"message"`
}

// AppStatus holds the current app registration status
type AppStatus struct {
	IsRegistered     bool   `json:"isRegistered"`
	IsDefaultBrowser bool   `json:"isDefaultBrowser"`
	ExePath          string `json:"exePath"`
}

// ProtocolApp represents a desktop application registered to handle a URL scheme
type ProtocolApp struct {
	Scheme      string `json:"scheme"`      // e.g. "figma", "msteams", "slack"
	AppName     string `json:"appName"`     // friendly name from registry, e.g. "Figma"
	CommandLine string `json:"commandLine"` // full command line including %1 placeholder
	ExePath     string `json:"exePath"`     // extracted executable path
	IsAvailable bool   `json:"isAvailable"` // true if the exe exists on disk
}

// AppRedirect represents a desktop app that can intercept web URLs and redirect
// them to the native desktop application via protocol handlers.
type AppRedirect struct {
	ID          string   `json:"id"`          // unique identifier e.g. "figma", "teams"
	Name        string   `json:"name"`        // display name e.g. "Figma"
	Scheme      string   `json:"scheme"`      // protocol scheme e.g. "figma"
	Domains     []string `json:"domains"`     // web domains to intercept e.g. ["figma.com"]
	Enabled     bool     `json:"enabled"`     // whether this redirect is active
	IsAvailable bool     `json:"isAvailable"` // whether the desktop app is installed
}
