@echo off
echo Building LinkRight installer...
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" "%~dp0LinkRight.iss"
if %errorlevel% == 0 (
    echo.
    echo Done! Installer is at: %~dp0output\LinkRight_Setup.exe
    explorer "%~dp0output"
) else (
    echo.
    echo Build failed.
)
pause
