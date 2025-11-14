#!/bin/bash
# Frontier Flight Scraper - Linux/Mac Startup Script
# Run: chmod +x start.sh && ./start.sh

set -e

echo ""
echo "================================================================================"
echo " FRONTIER FLIGHT SCRAPER - Starting Server"
echo "================================================================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    echo ""
    exit 1
fi

echo "[INFO] Node.js found: $(node --version)"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "[WARNING] .env file not found!"
    echo "Copying .env.example to .env..."
    cp .env.example .env
    echo ""
    echo "[ACTION REQUIRED] Please edit .env file with your Decodo credentials"
    echo "Then restart this script."
    echo ""
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "[INFO] Installing dependencies..."
    npm install
    echo ""

    echo "[INFO] Installing Playwright browsers..."
    npm run install-browsers
    echo ""
fi

# Create required directories
mkdir -p logs cache

echo "[INFO] Starting Frontier Flight Scraper..."
echo ""
echo "Web Interface: http://localhost:3000"
echo "Press Ctrl+C to stop the server"
echo ""
echo "================================================================================"
echo ""

# Start the server
node backend/server.js
