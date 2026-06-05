@echo off
echo ============================================
echo  Link Right - Reset + Rebuild + Run
echo  (Simulates a fresh install for testing)
echo ============================================
echo.

:: Step 1: Uninstall / clean all state
echo [1/3] Cleaning previous install state...
call "%~dp0uninstall.cmd" >nul 2>&1
echo   Done.

:: Step 2: Rebuild
echo [2/3] Building LinkRight.exe...
cd /d "%~dp0..\LinkRight"
wails build >"%~dp0..\build_output.txt" 2>&1
if %errorlevel% neq 0 (
    echo   BUILD FAILED. See build_output.txt for details.
    type "%~dp0..\build_output.txt"
    pause
    exit /b 1
)
echo   Build successful.

:: Step 3: Launch
echo [3/3] Launching LinkRight.exe as a fresh user...
start "" "%~dp0..\LinkRight\build\bin\LinkRight.exe"

echo.
echo ============================================
echo  Done! LinkRight is running fresh.
echo  Close it and run this script again to
echo  repeat the clean test cycle.
echo ============================================
echo.
