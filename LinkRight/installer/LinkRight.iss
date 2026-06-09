; ============================================================
;  Link Right — Inno Setup Installer Script
;  Produces: LinkRight_Setup.exe
;  Per-user install, no admin required
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
AppPublisherURL=https://github.com/setbro/linkright
AppSupportURL=https://github.com/setbro/linkright/issues
AppUpdatesURL=https://github.com/setbro/linkright/releases
DefaultDirName={localappdata}\LinkRight
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
; Per-user install — no admin prompt
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\installer\output
OutputBaseFilename=LinkRight_Setup
SetupIconFile=..\LinkRight\build\windows\icon.ico
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

