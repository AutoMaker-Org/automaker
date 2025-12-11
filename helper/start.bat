@echo off
echo Starting Automaker Helper Service...
echo ==================================
echo.

REM Check if node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed. Please install Node.js first.
    exit /b 1
)

REM Check if npm is installed
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: npm is not installed. Please install npm first.
    exit /b 1
)

REM Install dependencies if needed
if not exist node_modules (
    echo Installing dependencies...
    call npm install
)

REM Start the helper service
echo Starting helper service on port 13131...
echo.
echo The helper service enables full filesystem and system access
echo for the Automaker web application.
echo.
echo Keep this terminal open while using Automaker in your browser.
echo.

npm start