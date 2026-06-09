@echo off
setlocal

:: ============================================
::  Link Right - Installer
::  Copies LinkRight.exe to a permanent location
::  and launches it so it can self-register as
::  a Windows browser.
::
::  No admin rights required.
:: ============================================

echo ============================================
echo  Link Right - Installer
echo ============================================
echo.

:: --- Locate the exe next to this script's parent ---
set "SRC_EXE=%~dp0..\LinkRight\LinkRight.exe"

:: Also check the build output location (wails build)
if not exist "%SRC_EXE%" (
    set "SRC_EXE=%~dp0..\LinkRight\build\bin\LinkRight.exe"
)

if not exist "%SRC_EXE%" (
    echo  ERROR: LinkRight.exe not found.
    echo  Expected at: %SRC_EXE%
    echo  Please build the project first with: wails build
    echo.
    pause
    exit /b 1
)

:: --- Destination: %LOCALAPPDATA%\LinkRight\ ---
set "INSTALL_DIR=%LOCALAPPDATA%\LinkRight"
set "INSTALL_EXE=%INSTALL_DIR%\LinkRight.exe"

echo [1/4] Creating install folder...
if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%"
    echo   Created: %INSTALL_DIR%
) else (
    echo   Already exists: %INSTALL_DIR%
)

echo.
echo [2/4] Copying LinkRight.exe...
copy /y "%SRC_EXE%" "%INSTALL_EXE%" >nul
if %errorlevel% neq 0 (
    echo   ERROR: Failed to copy exe. Is it currently running?
    pause
    exit /b 1
)
echo   Copied to: %INSTALL_EXE%

echo.
echo [3/4] Creating Start Menu shortcut...
set "START_MENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs"
set "LNK_PATH=%START_MENU%\Link Right.lnk"
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut(\"%LNK_PATH%\"); $s.TargetPath = \"%INSTALL_EXE%\"; $s.Description = \"Route every link to the right browser\"; $s.Save()" >nul 2>&1
if "%errorlevel%"=="0" (
    echo   Created: %LNK_PATH%
) else (
    echo   Warning: Could not create Start Menu shortcut ^(non-fatal^).
)

echo.
echo [4/4] Launching Link Right to register as a browser...
start "" "%INSTALL_EXE%"
echo   Launched. Link Right will register itself on first run.

echo.
echo ============================================
echo  Installation complete!
echo.
echo  NEXT STEP:
echo  Open Windows Settings ^> Apps ^> Default Apps,
echo  search for "Link Right", and set it as your
echo  default browser for HTTP and HTTPS.
echo.
echo  You can also press Win+I and search "default browser"
echo  to get there quickly.
echo ============================================
echo.

:: Offer to open Default Apps settings now
set /p OPEN_SETTINGS="Open Default Apps settings now? (Y/N): "
if /i "%OPEN_SETTINGS%"=="Y" (
    start ms-settings:defaultapps
)

echo.
echo  Done! Enjoy Link Right.
echo.
pause
