@echo off
setlocal

echo === Automaker status (%DATE% %TIME%) ===
echo.

echo Port 3007 (UI):
netstat -ano | findstr LISTENING | findstr ":3007" || echo   (not listening)

echo.
echo Port 3008 (Backend):
netstat -ano | findstr LISTENING | findstr ":3008" || echo   (not listening)

echo.
echo Try open:
echo   http://localhost:3007/
echo   http://localhost:3008/api/health
echo.
