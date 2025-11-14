@echo off
:: Frontier Flight Scraper - Windows Startup Script
:: Double-click this file to start the server

title Frontier Flight Scraper

echo.
echo ================================================================================
echo  FRONTIER FLIGHT SCRAPER - Starting Server
echo ================================================================================
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [INFO] Node.js found:
node --version
echo.

:: Check if .env file exists
if not exist ".env" (
    echo [WARNING] .env file not found!
    echo Copying .env.example to .env...
    copy .env.example .env
    echo.
    echo [ACTION REQUIRED] Please edit .env file with your Decodo credentials
    echo Then restart this script.
    echo.
    pause
    exit /b 1
)

:: Check if node_modules exists
if not exist "node_modules\" (
    echo [INFO] Installing dependencies...
    call npm install
    echo.

    echo [INFO] Installing Playwright browsers...
    call npm run install-browsers
    echo.
)

:: Create required directories
if not exist "logs\" mkdir logs
if not exist "cache\" mkdir cache

:: Check if port 3000 is already in use and kill the process
echo [INFO] Checking if port 3000 is available...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo [WARNING] Port 3000 is already in use by process %%a
    echo [INFO] Killing existing process...
    taskkill /F /PID %%a >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] Process killed successfully
    ) else (
        echo [WARNING] Could not kill process %%a - you may need to close it manually
    )
    timeout /t 2 /nobreak >nul
)

echo [INFO] Starting Frontier Flight Scraper...
echo.
echo Web Interface: http://localhost:3000
echo Press Ctrl+C to stop the server
echo.
echo ================================================================================
echo.

:: Start the server
node backend/server.js

:: If server stops, pause to show any error messages
echo.
echo [INFO] Server stopped.
pause
