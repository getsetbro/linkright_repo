@echo off
echo ============================================================
echo  Building LinkRight installer...
echo ============================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "SIGN_SCRIPT=%SCRIPT_DIR%sign.ps1"
set "APP_EXE=%SCRIPT_DIR%..\LinkRight\build\bin\LinkRight.exe"
set "INSTALLER_EXE=%SCRIPT_DIR%output\LinkRight_Setup.exe"

:: --- Step 1: Sign the application exe before bundling ---
echo [1/3] Signing LinkRight.exe...
powershell -ExecutionPolicy Bypass -File "%SIGN_SCRIPT%" "%APP_EXE%"
if %errorlevel% neq 0 (
    echo WARNING: Could not sign LinkRight.exe — continuing without signature.
    echo.
)

:: --- Step 2: Build the installer with Inno Setup ---
echo [2/3] Compiling installer with Inno Setup...
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" "%SCRIPT_DIR%LinkRight.iss"
if %errorlevel% neq 0 (
    echo.
    echo Build failed.
    pause
    exit /b 1
)

:: --- Step 3: Sign the installer exe ---
echo.
echo [3/3] Signing LinkRight_Setup.exe...
powershell -ExecutionPolicy Bypass -File "%SIGN_SCRIPT%" "%INSTALLER_EXE%"
if %errorlevel% neq 0 (
    echo WARNING: Could not sign LinkRight_Setup.exe — continuing without signature.
    echo.
)

echo.
echo ============================================================
echo  Done! Installer is at: %INSTALLER_EXE%
echo ============================================================
explorer "%SCRIPT_DIR%output"
pause
