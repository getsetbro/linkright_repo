# Link Right

**Route every link to the right browser — automatically.**

Link Right is a lightweight Windows utility that intercepts link clicks and routes them to the correct browser and profile based on your rules.

## Download

Grab the latest **LinkRight_Setup.zip** from [GitHub Releases](https://github.com/getsetbro/linkright_repo/releases), unzip, and run the installer. No admin required.

### ⚠️ "Windows protected your PC" warning

When you run the installer, Windows SmartScreen may show a blue **"Windows protected your PC"** dialog because the app isn't signed with a paid certificate. This is normal for small internal tools and is safe to bypass:

1. Click **"More info"**
2. Click **"Run anyway"**

That's it — the installer will proceed normally. You only need to do this once.

> **For IT / advanced users:** To suppress this warning across your team, see `LinkRight/installer/sign.ps1` for instructions on exporting the self-signed certificate and importing it into each machine's Trusted Publishers store.

## Features

- Rule-based routing by domain, URL pattern, or protocol
- Auto-detects Chrome, Edge, Brave, Firefox and all profiles
- Chooser popup when no rule matches
- Protocol handler support (`figma://`, `msteams://`, `slack://`, etc.)
- Per-user install — no admin needed
- No telemetry — your data stays local

## Building from Source

Requirements: Go 1.23+, Node.js 18+, [Wails CLI v2](https://wails.io)

```bash
cd LinkRight/LinkRight
wails build
# Output: build/bin/LinkRight.exe
```

To build the installer, install [Inno Setup 6](https://jrsoftware.org/isinfo.php) then:

```bash
cd LinkRight/installer
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" LinkRight.iss
# Output: output/LinkRight_Setup.exe
```

## License

See repository for details.
