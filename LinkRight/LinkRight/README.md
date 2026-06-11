# Link Right

**Route every link to the right browser — automatically.**

Link Right is a lightweight Windows utility that sits between Windows and your browsers. When you click a link anywhere on your PC, Link Right checks your rules and opens it in the correct browser and profile — no manual switching required.

---

## Features

- **Rule-based routing** — send links to specific browsers and profiles based on domain, URL pattern, or protocol
- **Browser & profile detection** — automatically finds Chrome, Edge, Brave, Firefox and all their profiles
- **Chooser popup** — when no rule matches, a fast picker lets you choose and optionally save a rule
- **Protocol handler support** — route `figma://`, `msteams://`, `slack://` and other deep links
- **No admin required** — per-user install, no elevated permissions needed
- **No telemetry** — your data never leaves your machine

---

## System Requirements

- Windows 10 or Windows 11
- [Microsoft WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (pre-installed on Windows 11; auto-installed on Windows 10 via Windows Update)

---

## Installation

1. Download **LinkRight_Setup.exe** from [GitHub Releases](https://github.com/getsetbro/linkright_repo/releases)
2. Run the installer — no admin prompt required
3. On first launch, Link Right automatically registers itself as a browser in Windows
4. Open **Windows Settings → Default Apps**, find **Link Right**, and set it as your default browser for `http` and `https`
5. Done — all links now route through Link Right

> ### ⚠️ "Windows protected your PC" warning
> When you first run the installer, Windows SmartScreen may show a blue warning because the app isn't signed with a paid certificate. This is normal for small internal tools and is safe to bypass:
> 1. Click **"More info"**
> 2. Click **"Run anyway"**
>
> You only need to do this once. To suppress the warning entirely across your team, ask your IT admin to import the self-signed certificate into each machine's Trusted Publishers store (see `installer/sign.ps1` for details).

---

## Setting Up Rules

1. Open Link Right (from Start Menu or system tray)
2. Go to the **Rules** tab
3. Click **+** to add a rule:
   - **Title** — a friendly name for the rule
   - **Conditions** — match on URL host, path, scheme, query string, or full URL
   - **Action** — choose the browser and profile to open
4. Rules are evaluated top-to-bottom; drag to reorder

### Example Rules

| Rule Name | Condition | Opens In |
|-----------|-----------|----------|
| Work sites | URL Host **is** `work.company.com` | Edge — Work Profile |
| GitHub | URL Host **contains** `github.com` | Chrome — Personal |
| Figma links | URL Scheme **is** `figma` | Figma desktop app |
| Everything else | *(no match → Chooser popup)* | You choose |

---

## Chooser Popup

When no rule matches a link, Link Right shows a quick browser picker:

- Click a browser (or profile) to open the link
- Check **"Always use this for [domain]"** to automatically create a rule for next time
- Press **Escape** or click outside to cancel

---

## General Settings

Open the **General** tab in Link Right settings to configure:

- **Registration** — register or unregister Link Right as a Windows browser
- **Primary browser** — the browser used when fallback behavior is set to "Use Primary Browser"
- **Fallback behavior** — choose between showing the Chooser popup or silently using the primary browser when no rule matches

---

## Browsers Tab

The **Browsers** tab shows all detected browsers and profiles. You can:

- **Refresh** — re-scan for newly installed browsers
- **Add** — manually add a browser not auto-detected (provide a name and path to the exe)
- **Remove** — remove a manually added browser
- **Set as Primary** — set the primary browser used for fallback routing

---

## Uninstalling

Use **Windows Settings → Apps → Link Right → Uninstall**, or run the uninstaller from the Start Menu. This will:

- Remove all registry entries written by Link Right (HKCU only)
- Delete `%APPDATA%\LinkRight\` (your rules and settings)
- Remove Start Menu shortcuts
- Prompt you to reassign your default browser in Windows Settings if Link Right was set as default

No admin rights required.

---

## Command-Line Reference

| Flag | Description |
|------|-------------|
| *(no args)* | Open settings UI |
| `http://...` or `https://...` | Route a URL through rules (used by Windows when Link Right is the default browser) |
| `--uninstall` | Run the uninstaller (registry cleanup) |
| `--dev` | Skip auto-registration (for development/testing) |

---

## Data & Privacy

- All data is stored locally in `%APPDATA%\LinkRight\config.json`
- No network requests, no telemetry, no accounts
- The config file is plain JSON — you can edit it directly if needed

---

## Troubleshooting

**Links aren't opening in Link Right**
→ Make sure Link Right is set as the default browser in Windows Settings → Default Apps

**A browser isn't showing up**
→ Go to the Browsers tab and click Refresh. If it still doesn't appear, use the Add (+) button to add it manually.

**A rule isn't matching**
→ Check the condition field and operator. Use "Full URL" with "contains" for broad matching, or "URL Host" with "is" for exact domain matching.

**WebView2 error on startup**
→ Install the [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) from Microsoft.

---

## Building from Source

Requirements: Go 1.23+, Node.js 18+, [Wails CLI v2](https://wails.io)

```bash
cd LinkRight/LinkRight
wails build
# Output: build/bin/LinkRight.exe
```

For live development:
```bash
wails dev
```

To build the installer, install [Inno Setup 6](https://jrsoftware.org/isinfo.php) then:
```bash
cd LinkRight/installer
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" LinkRight.iss
# Output: output/LinkRight_Setup.exe
```
