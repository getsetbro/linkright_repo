package main

import (
	"net/url"
	"regexp"
	"strings"
)

// MatchRule checks if a URL matches a given rule.
// If the rule has Conditions, compound matching is used.
// Otherwise falls back to legacy pattern/matchType matching.
func MatchRule(rawURL string, rule Rule) bool {
	if !rule.Enabled {
		return false
	}

	// Compound condition matching (new)
	if len(rule.Conditions) > 0 {
		return matchConditions(rawURL, rule.Conditions, rule.ConditionLogic)
	}

	// Legacy single-pattern matching
	return matchLegacy(rawURL, rule)
}

// matchConditions evaluates a list of conditions against a URL.
// logic: "any" = OR, "all" (or empty) = AND
func matchConditions(rawURL string, conditions []Condition, logic string) bool {
	if logic == "any" {
		for _, c := range conditions {
			if matchCondition(rawURL, c) {
				return true
			}
		}
		return false
	}
	// Default: "all" = AND
	for _, c := range conditions {
		if !matchCondition(rawURL, c) {
			return false
		}
	}
	return true
}

// matchCondition evaluates a single condition against a URL
func matchCondition(rawURL string, c Condition) bool {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}

	var subject string
	switch c.Field {
	case "host":
		subject = strings.ToLower(parsed.Hostname())
	case "scheme":
		subject = strings.ToLower(parsed.Scheme)
	case "path":
		subject = parsed.Path
	case "query":
		subject = parsed.RawQuery
	case "url":
		subject = rawURL
	default:
		subject = strings.ToLower(parsed.Hostname())
	}

	value := c.Value
	if c.Field != "path" && c.Field != "query" && c.Field != "url" {
		value = strings.ToLower(value)
	}

	switch c.Operator {
	case "is":
		return subject == value
	case "is_not":
		return subject != value
	case "contains":
		return strings.Contains(subject, value)
	case "begins_with":
		return strings.HasPrefix(subject, value)
	case "ends_with":
		return strings.HasSuffix(subject, value)
	case "matches_regex":
		matched, err := regexp.MatchString(value, subject)
		if err != nil {
			return false
		}
		return matched
	default:
		return strings.Contains(subject, value)
	}
}

// matchLegacy handles the original single-pattern rule matching
func matchLegacy(rawURL string, rule Rule) bool {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return false
	}

	host := strings.ToLower(parsedURL.Hostname())
	pattern := strings.ToLower(strings.TrimSpace(rule.Pattern))

	switch rule.MatchType {
	case "protocol":
		return matchProtocol(rawURL, pattern)
	case "domain":
		return matchDomain(host, pattern)
	case "wildcard":
		return matchWildcard(rawURL, pattern)
	case "contains":
		return strings.Contains(strings.ToLower(rawURL), pattern)
	case "regex":
		matched, err := regexp.MatchString(pattern, rawURL)
		if err != nil {
			return false
		}
		return matched
	default:
		return matchDomain(host, pattern)
	}
}

// matchProtocol checks if a URL uses the given scheme.
// pattern is the scheme without "://" (e.g. "figma", "msteams").
// An empty pattern matches any non-http(s) scheme.
func matchProtocol(rawURL, pattern string) bool {
	scheme := ExtractScheme(rawURL)
	if scheme == "" {
		return false
	}
	if pattern == "" {
		// Match any non-http(s) protocol
		return scheme != "http" && scheme != "https"
	}
	return scheme == strings.ToLower(pattern)
}

// matchDomain matches a host against a domain pattern
// Supports exact match (github.com) and wildcard subdomain (*.github.com)
func matchDomain(host, pattern string) bool {
	// Strip leading wildcard
	if strings.HasPrefix(pattern, "*.") {
		suffix := pattern[2:] // e.g. "company.com"
		return host == suffix || strings.HasSuffix(host, "."+suffix)
	}
	// Strip www. for comparison
	cleanHost := strings.TrimPrefix(host, "www.")
	cleanPattern := strings.TrimPrefix(pattern, "www.")
	return cleanHost == cleanPattern
}

// matchWildcard matches a full URL against a glob-style wildcard pattern
// e.g. "*/jira/*" matches "https://company.atlassian.net/jira/browse/PROJ-123"
func matchWildcard(rawURL, pattern string) bool {
	// Convert glob pattern to regex
	// Escape regex special chars except *
	escaped := regexp.QuoteMeta(pattern)
	// Replace escaped \* with .*
	regexStr := strings.ReplaceAll(escaped, `\*`, `.*`)
	matched, err := regexp.MatchString(`(?i)^`+regexStr+`$`, rawURL)
	if err != nil {
		return false
	}
	return matched
}

// FindMatchingRule returns the first rule (by priority) that matches the URL
// Returns nil if no rule matches
func FindMatchingRule(rawURL string, rules []Rule) *Rule {
	// Rules are already sorted by priority (ascending = higher priority first)
	for i := range rules {
		if MatchRule(rawURL, rules[i]) {
			return &rules[i]
		}
	}
	return nil
}

// ExtractDomain extracts the domain from a URL for display purposes
func ExtractDomain(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	host := parsed.Hostname()
	// Strip www.
	host = strings.TrimPrefix(host, "www.")
	return host
}

// ValidatePattern checks if a pattern is valid for the given match type
func ValidatePattern(pattern, matchType string) (bool, string) {
	if strings.TrimSpace(pattern) == "" {
		return false, "Pattern cannot be empty"
	}
	switch matchType {
	case "regex":
		_, err := regexp.Compile(pattern)
		if err != nil {
			return false, "Invalid regex: " + err.Error()
		}
	case "domain":
		// Basic domain validation
		p := strings.TrimPrefix(pattern, "*.")
		p = strings.TrimPrefix(p, "www.")
		if strings.Contains(p, " ") {
			return false, "Domain pattern cannot contain spaces"
		}
	}
	return true, ""
}
