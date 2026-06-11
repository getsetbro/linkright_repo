; ============================================================
;  Link Right — Inno Setup Installer Script
;  Produces: LinkRight_Setup.exe
;  Per-user install, no admin required
;
;  Code signing: The build script (build_installer.cmd) signs
;  both LinkRight.exe and LinkRight_Setup.exe using sign.ps1.
;  On first run it creates a self-signed certificate. To fully
;  suppress SmartScreen on co-workers' machines, export the cert
;  and have them import it into Trusted Publishers (see sign.ps1).
; ============================================================

#define AppName      "Link Right"
#define AppVersion   "1.0.0"
#define AppPublisher "Seth Broweleit"
#define AppExeName   "LinkRight.exe"
#define AppId        "{{A7F3C2D1-8B4E-4F9A-B6C5-3D2E1F0A9B8C}"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL=https://github.com/getsetbro/linkright_repo
AppSupportURL=https://github.com/getsetbro/linkright_repo/issues
AppUpdatesURL=https://github.com/getsetbro/linkright_repo/releases
DefaultDirName={localappdata}\LinkRight
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
; Per-user install — no admin prompt
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\installer\output
OutputBaseFilename=LinkRight_Setup
SetupIconFile=..\LinkRight\build\windows\icon.ico
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}
WizardImageFile=compiler:WizClassicImage-IS.bmp
WizardSmallImageFile=compiler:WizClassicSmallImage-IS.bmp
Compression=lzma2/ultra64
SolidCompression=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\LinkRight\build\bin\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Start Menu shortcut
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Comment: "Route every link to the right browser"

[Run]
; Launch the app after install (checkbox on the Finish page)
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent
; Open Default Apps settings so user can set Link Right as default browser
Filename: "{sys}\cmd.exe"; Parameters: "/c start ms-settings:defaultapps"; Description: "Open Default Apps settings to set Link Right as your default browser"; Flags: nowait postinstall skipifsilent shellexec

[UninstallRun]
; Run the built-in uninstaller to clean registry entries before removing files
Filename: "{app}\{#AppExeName}"; Parameters: "--uninstall"; RunOnceId: "CleanRegistry"; Flags: runhidden waituntilterminated

