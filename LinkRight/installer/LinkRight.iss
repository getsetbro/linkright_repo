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
; Show "Open Default Apps settings" after install
InfoAfterFile=after_install.rtf

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "startuptray"; Description: "Start Link Right in the system tray when Windows starts"; GroupDescription: "Additional options:"
Name: "launchapp"; Description: "Launch Link Right after installation"; GroupDescription: "Additional options:"

[Files]
Source: "..\LinkRight\build\bin\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Start Menu shortcut
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Comment: "Route every link to the right browser"
; Startup tray shortcut (only if task selected)
Name: "{userstartup}\{#AppName} (Tray)"; Filename: "{app}\{#AppExeName}"; Parameters: "--tray"; Comment: "Link Right system tray"; Tasks: startuptray

[Run]
; Register as a browser and launch the app (runs silently in background)
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent; Tasks: launchapp
; Open Default Apps settings so user can set Link Right as default browser
Filename: "{sys}\cmd.exe"; Parameters: "/c start ms-settings:defaultapps"; Description: "Open Default Apps settings to set Link Right as your default browser"; Flags: nowait postinstall skipifsilent shellexec

[UninstallRun]
; Run the built-in uninstaller to clean registry entries before removing files
Filename: "{app}\{#AppExeName}"; Parameters: "--uninstall"; Flags: runhidden waituntilterminated

[Code]
// Show a message after uninstall reminding user to reassign default browser
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    MsgBox(
      'Link Right has been uninstalled.' + #13#10 + #13#10 +
      'If Link Right was your default browser, please open' + #13#10 +
      'Windows Settings > Apps > Default Apps' + #13#10 +
      'and choose a new default browser.',
      mbInformation, MB_OK
    );
  end;
end;
