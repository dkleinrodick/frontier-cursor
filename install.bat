@echo off
:: Frontier Flight Scraper - Installation Script for Windows

title Frontier Flight Scraper - Installation

echo.
echo ================================================================================
echo  FRONTIER FLIGHT SCRAPER - Installation
echo ================================================================================
echo.

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please download and install Node.js 18+ from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [1/5] Checking Node.js...
node --version
echo     [OK] Node.js is installed
echo.

:: Install dependencies
echo [2/5] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo     [OK] Dependencies installed
echo.

:: Install Playwright browsers
echo [3/5] Installing Playwright browsers (this may take a few minutes)...
call npm run install-browsers
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Playwright browsers
    pause
    exit /b 1
)
echo     [OK] Playwright browsers installed
echo.

:: Create .env file
echo [4/5] Setting up configuration...
if not exist ".env" (
    copy .env.example .env
    echo     [OK] Created .env configuration file
) else (
    echo     [OK] .env file already exists
)
echo.

:: Create directories
echo [5/5] Creating directories...
if not exist "logs\" mkdir logs
if not exist "cache\" mkdir cache
echo     [OK] Directories created
echo.

echo ================================================================================
echo  INSTALLATION COMPLETE!
echo ================================================================================
echo.
echo Next steps:
echo   1. Edit .env file with your Decodo credentials (optional but recommended)
echo   2. Double-click start.bat to run the server
echo   3. Open http://localhost:3000 in your browser
echo.
echo For help, see README.md
echo.
pause
