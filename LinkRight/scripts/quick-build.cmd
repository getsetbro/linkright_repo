@echo off
setlocal

:: ============================================
::  Link Right - Quick Build + Install
::  Builds the app, copies it to the install
::  location.
:: ============================================

echo ============================================
echo  Link Right - Quick Build + Install
echo ============================================
echo.
echo Building...

:: Save script dir before cd changes it
set "SCRIPT_DIR=%~dp0"

cd /d "%~dp0..\LinkRight"
wails build >"%SCRIPT_DIR%..\build_output.txt" 2>&1

if %errorlevel% neq 0 (
    echo.
    echo  BUILD FAILED
    echo ============================================
    type "%~dp0..\build_output.txt"
    echo.
    pause
    exit /b 1
)

echo  Build OK
echo.

:: --- Copy new exe to install location ---
set "BUILD_EXE=%SCRIPT_DIR%..\LinkRight\build\bin\LinkRight.exe"
set "INSTALL_DIR=%LOCALAPPDATA%\LinkRight"
set "INSTALL_EXE=%INSTALL_DIR%\LinkRight.exe"

if exist "%INSTALL_DIR%" (
    echo Copying to install location...
    :: Kill any running instance first so we can overwrite
    taskkill /f /im LinkRight.exe >nul 2>&1
    timeout /t 1 /nobreak >nul
    copy /y "%BUILD_EXE%" "%INSTALL_EXE%" >nul
    if %errorlevel% equ 0 (
        echo  Copied to: %INSTALL_EXE%
    ) else (
        echo  Warning: Could not copy to install location (is it running?)
    )
) else (
    echo  Note: Install location not found (%INSTALL_DIR%) - skipping copy.
    echo  Run install.cmd first to set up the install location.
)

echo ============================================
echo  Done! Check the LinkRight window.
echo  Run this script again after your next change.
echo ============================================
