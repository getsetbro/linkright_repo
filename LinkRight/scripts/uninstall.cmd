@echo off
echo ============================================
echo  Link Right - Full Uninstall / Cleanup
echo ============================================
echo.

echo [1/6] Removing registry: StartMenuInternet...
reg delete "HKCU\SOFTWARE\Clients\StartMenuInternet\LinkRight" /f >nul 2>&1
if %errorlevel%==0 (echo   Done.) else (echo   Not found, skipping.)

echo [2/6] Removing registry: URL class...
reg delete "HKCU\SOFTWARE\Classes\LinkRightURL" /f >nul 2>&1
if %errorlevel%==0 (echo   Done.) else (echo   Not found, skipping.)

echo [3/6] Removing registry: RegisteredApplications...
reg delete "HKCU\SOFTWARE\RegisteredApplications" /v "LinkRight" /f >nul 2>&1
if %errorlevel%==0 (echo   Done.) else (echo   Not found, skipping.)

echo [4/6] Removing config file...
if exist "%APPDATA%\LinkRight\config.json" (
    del /f /q "%APPDATA%\LinkRight\config.json"
    echo   Deleted: %APPDATA%\LinkRight\config.json
) else (
    echo   Not found, skipping.
)

echo [5/6] Removing Start Menu shortcuts...
set "SM=%APPDATA%\Microsoft\Windows\Start Menu\Programs"
set "found=0"
if exist "%SM%\Link Right.lnk" (del /f /q "%SM%\Link Right.lnk" & set "found=1")
if exist "%SM%\LinkRight.lnk" (del /f /q "%SM%\LinkRight.lnk" & set "found=1")
if exist "%SM%\Link Right\Link Right.lnk" (del /f /q "%SM%\Link Right\Link Right.lnk" & set "found=1")
if exist "%SM%\Link Right\Uninstall Link Right.lnk" (del /f /q "%SM%\Link Right\Uninstall Link Right.lnk" & set "found=1")
if exist "%SM%\Link Right\" (rd /q "%SM%\Link Right" 2>nul)
if "%found%"=="1" (echo   Done.) else (echo   Not found, skipping.)

echo [6/6] Removing Startup shortcut...
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TRAY_LNK=%STARTUP_DIR%\Link Right (Tray).lnk"
if exist "%TRAY_LNK%" (
    del /f /q "%TRAY_LNK%"
    echo   Deleted: %TRAY_LNK%
) else (
    echo   Not found, skipping.
)

echo.
echo ============================================
echo  Cleanup complete. Link Right is fully
echo  removed from this user account.
echo ============================================
echo.
pause
