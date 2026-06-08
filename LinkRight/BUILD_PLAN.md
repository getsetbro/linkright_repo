# Link Right — Build Plan

## Overview
A lightweight Windows desktop utility that intercepts all system-wide link-opening requests and routes each link to the correct browser (and profile) based on user-configured rules. Built with Go + Wails (WebView2 frontend).

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Backend | Go |
| Frontend | HTML / CSS (Tailwind) / Vanilla JS |
| Desktop Framework | Wails v2 (WebView2) |
| Storage | JSON file in `%APPDATA%\LinkRight\` |
| Registry | HKCU (per-user, no admin required) |
| Output | Single `.exe` |

---

## Features

- Intercept all system-wide link-opening requests
- Route links to the correct browser based on user-configured rules
- Support rule types: domain-based routing, URL pattern matching
- Detect all installed browsers automatically
- Detect browsers and browser profiles (Chrome, Edge, Brave, Firefox)
- Launch the correct browser + profile with the intercepted URL
- **Chooser popup** — when no rule matches or anything fails, show a quick browser picker
  - "Always use this" checkbox to auto-create a rule
- Store rules locally (JSON), no cloud dependency
- No data collection or telemetry
- Per-user install, no admin permissions required

---

## Build Phases

### Phase 1: Dev Environment Setup ✅
- [x] Install Go toolchain
- [x] Install Node.js
- [x] Install Wails CLI (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)

### Phase 2: Scaffold Wails Project ✅
- [x] Run `wails init` with vanilla template in `LinkRight/`
- [x] Verify project builds and runs with `wails dev`
- [x] Set app name to "Link Right", configure window settings

### Phase 3: Go Backend — Browser & Profile Detection ✅
- [x] Scan Windows Registry (`HKLM\SOFTWARE\Clients\StartMenuInternet`) for installed browsers
- [x] Get browser executable paths
- [x] Scan browser user data directories for profiles:
  - Chrome: `%LOCALAPPDATA%\Google\Chrome\User Data\`
  - Edge: `%LOCALAPPDATA%\Microsoft\Edge\User Data\`
  - Brave: `%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\`
  - Firefox: `%APPDATA%\Mozilla\Firefox\Profiles\` + `profiles.ini`
- [x] Read friendly profile names from each profile's Preferences file
- [x] Expose `GetBrowsers()` method to frontend

### Phase 4: Go Backend — Rule Engine & Config Storage ✅
- [x] Define rule data model (id, name, pattern, matchType, browser, profile, priority)
- [x] Implement domain-based matching (exact + wildcard like `*.company.com`)
- [x] Implement URL pattern matching (glob/regex)
- [x] Priority ordering (first match wins)
- [x] Read/write rules as JSON in `%APPDATA%\LinkRight\config.json`
- [x] Expose CRUD methods to frontend: `GetRules()`, `SaveRule()`, `DeleteRule()`, `ReorderRules()`

### Phase 5: Go Backend — Windows Registry Integration ✅
- [x] Register as a browser in HKCU:
  - `HKCU\SOFTWARE\Clients\StartMenuInternet\LinkRight\`
  - `HKCU\SOFTWARE\Classes\LinkRightURL\`
  - `HKCU\SOFTWARE\RegisteredApplications`
- [x] URL protocol handler registration (http, https)
- [x] Unregister function (clean removal of all keys)
- [x] Expose `Register()`, `Unregister()`, `IsRegistered()` to frontend
- [x] `IsDefaultBrowser()` — detects if LinkRight is set as Windows default (reads UserChoice registry key)
- [x] `OpenDefaultAppsSettings()` — opens `ms-settings:defaultapps`
- [x] `AppStatus.IsDefaultBrowser` field added to model
- [x] `Config.FirstRun` field added to model
- [x] `ChooserRequest` / `ChooserResponse` models added
- [x] Phase 6 method stubs added to app.go (`GetCurrentURL`, `IsChooserMode`, `ProcessURL`, `GetChooserData`, `OpenWithBrowser`, `CancelChooser`)
- [x] `LaunchBrowser()` / `buildLaunchArgs()` implemented in launcher.go (Chromium + Firefox profile flags)

### Phase 5a: Go Backend — Custom Browser Management ✅
- [x] Scan browser user data directories for additional browser variants:
  - Other versions of Chrome (e.g. Chrome Beta, Dev, Canary)
  - Other versions of Firefox (e.g. Firefox Beta, Nightly, ESR)
  - Opera / Opera GX
- [x] Allow users to manually add browsers not auto-detected, or added after detection (custom name + executable path)
- [x] Store custom browsers in config JSON alongside auto-detected ones
- [x] Expose `AddCustomBrowser()`, `RemoveCustomBrowser()` methods to frontend
- [x] Merge custom browsers with auto-detected list in `GetBrowsers()`

### Phase 5b: Protocol Handler & Deep Link Support ✅
- [x] Detect links that use non-http(s) schemes (e.g. `figma://`, `msteams://`, `slack://`)
- [x] Route protocol-handler links directly to the registered desktop app — no browser prompt
- [x] Support deep links that open a specific resource in the desktop app (e.g. `figma://file/{key}`)
- [x] Add `matchType: "protocol"` to the rule model for protocol-scheme-based rules
- [x] Expose protocol rules in the UI (add/edit/delete like domain rules)
- [x] Graceful fallback: if no desktop app is registered for the protocol, show Chooser with a warning

### Phase 6: Go Backend — URL Entry Point & Browser Launcher ✅
- [x] On app launch, check for URL in command-line arguments
- [x] If URL present: evaluate rules → launch browser or show Chooser
- [x] If no URL: open settings UI (settings mode)
- [x] Browser launch: `exec.Command(browserPath, profileFlags..., url)`
- [x] Handle Chromium profile flag: `--profile-directory="Profile 1"`
- [x] Handle Firefox profile flag: `-P "ProfileName"`
- [x] Handle other browsers if/in the way they support profiles. If they dont handle profiles open them directly.

### Phase 7: Frontend — Chooser Popup Window ✅
- [x] Small, fast-loading popup window in middle of screen
- [x] Display the URL being opened
- [x] List all detected browsers + profiles with icons (configurable in settings)
- [x] "Always use this for [domain]" checkbox
- [x] Open button → launches selected browser, optionally saves rule
- [x] Cancel by clicking outside of modal or esc key
- [x] Show message modal when triggered by missing browser/profile with info on how to fix

### Phase 4b: Go Backend — Compound Rule Conditions ✅
- [x] Add `Condition` struct: `{ Field, Operator, Value }`
  - Fields: `host`, `scheme`, `path`, `query`, `url`
  - Operators: `contains`, `is`, `is_not`, `begins_with`, `ends_with`, `matches_regex`
- [x] Add `Conditions []Condition` and `ConditionLogic string` ("any"/"all") to `Rule` struct
- [x] Update `MatchRule()` to evaluate compound conditions with AND/OR logic
- [x] Backward-compatible: if `Conditions` is empty, fall back to legacy `pattern`/`matchType`
- [x] Config serialization persists conditions automatically (JSON tags)

### Phase 8: Frontend — Settings/Management UI ✅
- [x] Three-tab layout: **General** | **Browsers** | **Rules** (with icons, active indicator)

#### Phase 8a: General Tab ✅
- [x] Registration section: Register / Unregister as Windows browser
- [x] Default browser status + "Set as Default…" button (opens `ms-settings:defaultapps`)
- [x] Fallback behavior: radio buttons (Show Chooser / Use Default Browser)
- [x] Default browser + profile dropdowns with Save Settings button

#### Phase 8b: Browsers Tab ✅
- [x] Browser list: icon + name + default indicator (✓) per row
- [x] Bottom toolbar: Add (+), Remove (−), Refresh (↺), Set as Default (✓) buttons
- [x] Hover highlight on browser rows

#### Phase 8c: Rules Tab — Rule List ✅
- [x] Rules list with drag-to-reorder (HTML5 drag-and-drop, blue drop indicator)
- [x] Each rule row: drag handle, name, condition summary, target browser, enable toggle
- [x] Warning badge for rules pointing to missing browsers/profiles
- [x] Click to select, double-click to edit
- [x] Bottom toolbar: Add (+), Delete (−), Edit buttons

#### Phase 8d: Rules Tab — Rule Editor Dialog ✅
- [x] Modal dialog with dark theme matching app style
- [x] **Title** field: text input for rule name
- [x] **Condition Builder** ("Use this rule when:"):
  - Quantifier dropdown: `Any` / `All` + "of the following are true"
  - Dynamic condition rows with +/− buttons per row and global + button
  - Field dropdown: URL Host, URL Scheme, URL Path, URL Query String, Full URL
  - Operator dropdown: contains, is, is not, begins with, ends with, matches regex
  - Value text input per condition
  - Minimum one condition enforced
- [x] **Action** section ("When this rule is used:"):
  - Action dropdown: "Open in the following browser"
  - Browser dropdown (populated from `GetBrowsers()`)
  - Profile dropdown (auto-populated when browser selected)
- [x] **Footer**: "Enable this rule" checkbox + Cancel + OK buttons
- [x] Validation: title required, all condition values required, browser required
- [x] Saves via `SaveRule()` API, reloads rule list on success

### Phase 9: Polish & Error Handling ✅
- [x] Graceful fallback: any failure → show Chooser (never silently fail)
- [x] First-run experience: auto-register on first launch, welcome overlay prompts user to set as default browser
- [x] App icon and window branding (`build/windows/icon.ico`, `build/appicon.png`)
- [x] Validate rules on load (mark broken ones with warning badge)
- [x] System tray icon — see Phase 9a

### Phase 9a: System Tray Popup ✅
A compact popup window launched via `--tray` flag when the user clicks the system tray icon.
Modelled after Velja (macOS) — a dark, menu-style panel with browser shortcuts and quick actions.

#### Backend (`app.go`, `main.go`)
- [x] `IsTrayMode() bool` — detects `--tray` launch flag
- [x] `GetClipboardURL() string` — reads clipboard; returns URL string if valid http/https/custom scheme, else `""`
- [x] `OpenURLFromClipboard()` — runs clipboard URL through the full rule-matching + launch pipeline
- [x] `LaunchBrowserByName(name string)` — opens the clipboard URL in the named browser (bypasses rules)
- [x] `OpenSettings()` — spawns a new LinkRight process in settings mode (no URL arg)
- [x] `QuitApp()` — calls `runtime.Quit`
- [x] `main.go` tray window: 320 × 480 px, frameless, always-on-top, no resize, positioned bottom-right

#### Frontend (`main.js`)
- [x] Boot: detect tray mode via `App.IsTrayMode()`, branch to `renderTrayMode()`
- [x] **"Open URL from Clipboard"** row — enabled/clickable when clipboard holds a URL; greyed out otherwise
- [x] **"Primary Browser"** section header
- [x] Browser list rows — icon + name + keyboard shortcut badge (1–9); checkmark on default browser
- [x] Keyboard shortcuts: press 1–9 to instantly open clipboard URL in that browser; Escape to close
- [x] **"Settings…"** row — opens settings window via `App.OpenSettings()`
- [x] **"Quit"** row — calls `App.QuitApp()`
- [x] Clicking outside the popup (or pressing Escape) closes the window

#### Styles (`style.css`)
- [x] `.tray-root` — full-height flex column, dark translucent background, rounded corners, subtle border
- [x] `.tray-section-header` — small caps label (e.g. "Primary Browser")
- [x] `.tray-row` — hover highlight, icon + label + right-side shortcut badge
- [x] `.tray-row.disabled` — muted colour, no hover effect
- [x] `.tray-separator` — thin horizontal rule between sections
- [x] `.tray-shortcut` — right-aligned keyboard shortcut badge (monospace, muted)
- [x] `.tray-check` — checkmark indicator for the active default browser

### Phase 10: Build & Distribution ✅
- [x] `wails build` → single `LinkRight.exe` (~14 MB, built successfully at `build/bin/LinkRight.exe`)
- [x] Test on clean Windows user account
- [x] Verify: link interception, rule matching, Chooser popup, profile launching
- [x] README with usage instructions (`README.md` — full user-facing docs)

### Phase 11: Uninstaller ✅
- [x] Embedded uninstall flag `--uninstall` in `LinkRight.exe` (no separate exe needed)
- [x] Remove all HKCU registry entries written by Link Right (`uninstall.go`)
- [x] Delete `%APPDATA%\LinkRight\` directory and all contents
- [x] Remove any Start Menu shortcuts created at install
- [x] Confirm the PC is left in the exact state it was before Link Right was installed
- [x] Show a brief confirmation dialog before and after uninstall (Windows native MessageBox)

---

## Dev Tooling

### Testing & Clean State
- `scripts\uninstall.cmd` — removes all registry entries + config (simulate fresh user)
- `scripts\reset-test.cmd` — uninstall + rebuild + launch (full clean test cycle)
- `scripts\ui-dev.cmd` — start Vite dev server with mock data (no Go/registry needed)

### UI Development (No Install Required)
- Run `scripts\ui-dev.cmd` or `npm run dev` in `frontend/`
- Opens at `http://localhost:5173` with hot-reload
- Mock Go backend in `frontend/src/mock.js` — edit sample data freely
- Set `MOCK_IS_CHOOSER = true` in `mock.js` to preview the chooser popup
- **No install, no registry changes, no Go build needed** — pure frontend iteration

### New-User Reset (Dev Testing)
- `scripts\reset-new-user.cmd` — wipes all Link Right state so devs can test the first-run flow from scratch:
  - Runs `scripts\uninstall.cmd` (removes registry entries)
  - Deletes `%APPDATA%\LinkRight\` (removes config + rules)
  - Clears any cached "already registered" flags
- After running, the next launch of the app behaves exactly as it would for a brand-new user

### Dev Mode (wails dev)
- `wails dev` automatically skips auto-registration (detects `WAILS_DEV` env var)
- Run built exe with `--dev` flag to also skip registration manually
- Registry is only touched when explicitly clicking "Register" in Settings

---

## Data Model

```json
{
  "defaultBrowser": "Firefox",
  "defaultProfile": "Default",
  "fallbackBehavior": "chooser",
  "rules": [
    {
      "id": "uuid-1",
      "name": "Work sites",
      "pattern": "*.company.com",
      "matchType": "domain",
      "browser": "Microsoft Edge",
      "browserPath": "C:\\Program Files\\Microsoft\\Edge\\msedge.exe",
      "profile": "Profile 1",
      "profileName": "Work",
      "priority": 1
    },
    {
      "id": "uuid-2",
      "name": "GitHub",
      "pattern": "github.com",
      "matchType": "domain",
      "browser": "Google Chrome",
      "browserPath": "C:\\Program Files\\Google\\Chrome\\chrome.exe",
      "profile": "Default",
      "profileName": "Default",
      "priority": 2
    }
  ]
}
```

---

## URL Routing Flow

```
URL received (command-line arg)
    │
    ▼
Check rules (in priority order)
    │
    ├── Rule matches + browser/profile exists → Launch directly ✅
    │
    └── No match / error / missing browser/profile → Show Chooser popup 🔲
                                                        │
                                                        ├── User picks + "Always use" checked → Open + save rule
                                                        └── User picks + "Always use" unchecked → Open (no rule saved)
```

---

## Registry Structure (HKCU)

```
HKCU\SOFTWARE\Clients\StartMenuInternet\LinkRight
    (Default) = "Link Right"

HKCU\SOFTWARE\Clients\StartMenuInternet\LinkRight\Capabilities
    ApplicationName = "Link Right"
    ApplicationDescription = "Routes links to the right browser"

HKCU\SOFTWARE\Clients\StartMenuInternet\LinkRight\Capabilities\URLAssociations
    http = "LinkRightURL"
    https = "LinkRightURL"

HKCU\SOFTWARE\Clients\StartMenuInternet\LinkRight\shell\open\command
    (Default) = "C:\path\to\LinkRight.exe" "%1"

HKCU\SOFTWARE\Classes\LinkRightURL
    (Default) = "Link Right URL"
    URL Protocol = ""

HKCU\SOFTWARE\Classes\LinkRightURL\shell\open\command
    (Default) = "C:\path\to\LinkRight.exe" "%1"

HKCU\SOFTWARE\RegisteredApplications
    LinkRight = "SOFTWARE\Clients\StartMenuInternet\LinkRight\Capabilities"
```

---

## Consumer Install Experience

1. Download `LinkRight.exe` (single file, ~10-15MB)
2. Run it (no admin prompt)
3. App auto-registers as a browser on first launch
4. User sets Link Right as default browser in Windows Settings
5. Done — all links now route through Link Right
