@echo off
echo ============================================
echo  Link Right - UI Dev Mode
echo  (No Go, no install, no registry changes)
echo ============================================
echo.
echo Starting Vite dev server with mock data...
echo Open http://localhost:5173 in your browser.
echo Hot-reload is enabled - edit JS/CSS and see
echo changes instantly.
echo.
echo Press Ctrl+C to stop.
echo.
cd /d "%~dp0..\LinkRight\frontend"
npm run dev
