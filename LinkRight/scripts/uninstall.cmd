@echo off
echo ============================================
echo  Link Right - Full Uninstall / Cleanup
echo ============================================
echo.

echo [1/4] Removing registry: StartMenuInternet...
reg delete "HKCU\SOFTWARE\Clients\StartMenuInternet\LinkRight" /f >nul 2>&1
if %errorlevel%==0 (echo   Done.) else (echo   Not found, skipping.)

echo [2/4] Removing registry: URL class...
reg delete "HKCU\SOFTWARE\Classes\LinkRightURL" /f >nul 2>&1
if %errorlevel%==0 (echo   Done.) else (echo   Not found, skipping.)

echo [3/4] Removing registry: RegisteredApplications...
reg delete "HKCU\SOFTWARE\RegisteredApplications" /v "LinkRight" /f >nul 2>&1
if %errorlevel%==0 (echo   Done.) else (echo   Not found, skipping.)

echo [4/4] Removing config file...
if exist "%APPDATA%\LinkRight\config.json" (
    del /f /q "%APPDATA%\LinkRight\config.json"
    echo   Deleted: %APPDATA%\LinkRight\config.json
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
