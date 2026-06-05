package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"

	"github.com/google/uuid"
)

// configDir returns the path to the app's config directory
func configDir() string {
	appData := os.Getenv("APPDATA")
	return filepath.Join(appData, "LinkRight")
}

// configPath returns the full path to the config file
func configPath() string {
	return filepath.Join(configDir(), "config.json")
}

// LoadConfig reads the config from disk, returning defaults if not found
func LoadConfig() Config {
	data, err := os.ReadFile(configPath())
	if err != nil {
		return defaultConfig()
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return defaultConfig()
	}

	// Ensure rules are sorted by priority
	sortRules(cfg.Rules)
	return cfg
}

// SaveConfig writes the config to disk
func SaveConfig(cfg Config) error {
	dir := configDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath(), data, 0644)
}

func defaultConfig() Config {
	return Config{
		DefaultBrowser:   "",
		DefaultProfile:   "Default",
		FallbackBehavior: "chooser",
		Rules:            []Rule{},
		ChooserSettings: ChooserSettings{
			IconSize:         "large",
			ShowBrowserNames: true,
			ShowURL:          true,
		},
	}
}

func sortRules(rules []Rule) {
	sort.Slice(rules, func(i, j int) bool {
		return rules[i].Priority < rules[j].Priority
	})
}

// AddRule adds a new rule and saves config
func AddRule(cfg *Config, rule Rule) error {
	if rule.ID == "" {
		rule.ID = uuid.New().String()
	}
	if rule.Priority == 0 {
		rule.Priority = len(cfg.Rules) + 1
	}
	rule.Enabled = true
	cfg.Rules = append(cfg.Rules, rule)
	sortRules(cfg.Rules)
	return SaveConfig(*cfg)
}

// UpdateRule updates an existing rule by ID
func UpdateRule(cfg *Config, updated Rule) error {
	for i, r := range cfg.Rules {
		if r.ID == updated.ID {
			cfg.Rules[i] = updated
			sortRules(cfg.Rules)
			return SaveConfig(*cfg)
		}
	}
	return nil
}

// DeleteRule removes a rule by ID and re-numbers priorities
func DeleteRule(cfg *Config, id string) error {
	var newRules []Rule
	for _, r := range cfg.Rules {
		if r.ID != id {
			newRules = append(newRules, r)
		}
	}
	// Re-number priorities
	for i := range newRules {
		newRules[i].Priority = i + 1
	}
	cfg.Rules = newRules
	return SaveConfig(*cfg)
}

// ReorderRules sets rules in the given order (by IDs) and saves
func ReorderRules(cfg *Config, orderedIDs []string) error {
	idToRule := map[string]Rule{}
	for _, r := range cfg.Rules {
		idToRule[r.ID] = r
	}

	var newRules []Rule
	for i, id := range orderedIDs {
		if r, ok := idToRule[id]; ok {
			r.Priority = i + 1
			newRules = append(newRules, r)
		}
	}
	cfg.Rules = newRules
	return SaveConfig(*cfg)
}

// ValidateRules checks all rules against currently installed browsers/profiles
func ValidateRules(rules []Rule, browsers []Browser) []RuleValidation {
	var validations []RuleValidation

	// Build lookup maps
	browserPaths := map[string]Browser{}
	for _, b := range browsers {
		browserPaths[b.Path] = b
	}

	for _, rule := range rules {
		v := RuleValidation{RuleID: rule.ID}

		browser, found := browserPaths[rule.BrowserPath]
		if !found {
			v.BrowserMissing = true
			v.Message = "Browser not found: " + rule.Browser
			validations = append(validations, v)
			continue
		}

		if rule.Profile != "" && rule.Profile != "Default" {
			profileFound := false
			for _, p := range browser.Profiles {
				if p.ID == rule.Profile {
					profileFound = true
					break
				}
			}
			if !profileFound {
				v.ProfileMissing = true
				v.Message = "Profile '" + rule.ProfileName + "' not found in " + rule.Browser
				validations = append(validations, v)
			}
		}
	}

	return validations
}
