@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM restart-automaker.cmd
REM Kills anything listening on ports 3007 (UI) and 3008 (backend), then starts both.
REM Run from: C:\Users\Robo1\.openclaw\workspace\automaker

set "ROOT=%~dp0"

echo.
echo === Automaker restart (%DATE% %TIME%) ===
echo Root: %ROOT%
echo.

call :killPort 3007
call :killPort 3008

echo.
echo Starting backend (apps/server) on http://localhost:3008 ...
REM Using tsx directly is more reliable than watch-mode when starting/stopping frequently
start "Automaker Backend" cmd /k "cd /d "%ROOT%apps\server" ^&^& npx.cmd --yes tsx src/index.ts"

echo Starting UI (apps/ui) on http://localhost:3007 ...
start "Automaker UI" cmd /k "cd /d "%ROOT%" ^&^& npm.cmd run _dev:web"

echo.
echo Done. Open: http://localhost:3007/
echo (If accessing from another device, use: http://YOUR-LAN-IP:3007/ )
echo.
goto :eof

:killPort
set "PORT=%~1"
echo --- Killing anything on port %PORT% ---
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr LISTENING') do (
  echo taskkill /PID %%a /F
  taskkill /PID %%a /F >nul 2>&1
)
exit /b 0
